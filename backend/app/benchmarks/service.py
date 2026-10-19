from dataclasses import dataclass

from sqlalchemy.orm import Session

from backend.app.benchmarks.canonical import (
    canonical_label,
    resolve_metric,
    to_canonical_value,
)
from backend.app.benchmarks.directions import (
    AT_TARGET_TOLERANCE_PERCENT,
    NOT_COMPARABLE,
    classify,
)
from backend.app.benchmarks.errors import ProjectNotFound
from backend.app.models.submission import (
    SUBMISSION_STATUS_APPROVED,
    SUBMISSION_STATUS_UNREVIEWED,
)
from backend.app.performance.periods import parse_reporting_period
from backend.app.performance.service import get_latest_approved_metrics
from backend.app.repositories.benchmarks import find_benchmarks_for_scope
from backend.app.repositories.projects import get_project_by_id
from backend.app.repositories.submissions import list_submissions_for_project

# Machine-readable reasons a metric cannot be benchmarked. The UI turns these into
# an explanation; it must never silently drop an unmatched metric, because a
# missing bar and a passing bar look the same to a reader who is scanning.
REASON_PROJECT_SCOPE_UNKNOWN = "PROJECT_SCOPE_UNKNOWN"
REASON_NO_BENCHMARK_FOR_SCOPE = "NO_BENCHMARK_FOR_SCOPE"
REASON_UNIT_MISMATCH = "UNIT_MISMATCH"
REASON_UNKNOWN_METRIC_DIRECTION = "UNKNOWN_METRIC_DIRECTION"
REASON_BENCHMARK_NOT_USABLE = "BENCHMARK_NOT_USABLE"
REASON_PERIOD_NOT_PARSEABLE = "PERIOD_NOT_PARSEABLE"

CELL_APPROVED = "APPROVED"
CELL_UNREVIEWED = "UNREVIEWED"
CELL_MISSING = "MISSING"


@dataclass(frozen=True)
class BenchmarkSource:
    provider: str
    source_name: str
    source_version: str
    source_url: str | None
    country: str
    property_type: str
    year: int


@dataclass(frozen=True)
class BenchmarkComparison:
    metric_name: str
    reporting_period: str
    submission_id: int
    value: float
    unit: str
    direction: str | None
    benchmark_value: float | None
    benchmark_unit: str | None
    source: BenchmarkSource | None
    difference_percent: float | None
    classification: str
    reason: str | None


@dataclass(frozen=True)
class BenchmarkReport:
    project_id: int
    project_name: str
    organisation_name: str
    country: str | None
    property_type: str | None
    tolerance_percent: float
    comparisons: list[BenchmarkComparison]


@dataclass(frozen=True)
class ConsistencyCell:
    metric_name: str
    reporting_period: str
    state: str
    value: float | None
    unit: str | None
    submission_id: int | None


@dataclass(frozen=True)
class ConsistencyReport:
    project_id: int
    metrics: list[str]
    periods: list[str]
    cells: list[ConsistencyCell]
    approved_cells: int
    total_cells: int
    approved_coverage_percent: float | None


def _require_project(db: Session, project_id: int):
    project = get_project_by_id(db, project_id)
    if project is None:
        raise ProjectNotFound(f"Project {project_id} was not found.")
    return project


def _not_comparable(metric, reason: str, direction: str | None) -> BenchmarkComparison:
    point = metric.latest
    return BenchmarkComparison(
        metric_name=canonical_label(metric.metric_name),
        reporting_period=point.reporting_period,
        submission_id=point.submission_id,
        value=point.value,
        unit=point.unit,
        direction=direction,
        benchmark_value=None,
        benchmark_unit=None,
        source=None,
        difference_percent=None,
        classification=NOT_COMPARABLE,
        reason=reason,
    )


def get_benchmark_report(project_id: int, *, db: Session) -> BenchmarkReport:
    """Compare each latest APPROVED metric against the best-matching benchmark.

    Only approved data is benchmarked: an unreviewed number has not passed review,
    so presenting it against an external target would imply a confidence the
    platform has not established.
    """
    project = _require_project(db, project_id)
    metrics = get_latest_approved_metrics(project_id, db=db)

    comparisons: list[BenchmarkComparison] = []
    for metric in sorted(metrics, key=lambda item: canonical_label(item.metric_name)):
        canonical = resolve_metric(metric.metric_name)
        point = metric.latest

        if canonical is None:
            comparisons.append(_not_comparable(metric, REASON_UNKNOWN_METRIC_DIRECTION, None))
            continue

        direction = canonical.direction

        # Convert the measurement into the canonical unit the frontend displays, so
        # the number shown and the number judged are the same number.
        measured = to_canonical_value(point.value, point.unit, canonical)
        if measured is None:
            comparisons.append(_not_comparable(metric, REASON_UNIT_MISMATCH, direction))
            continue

        if not project.country or not project.property_type:
            comparisons.append(_not_comparable(metric, REASON_PROJECT_SCOPE_UNKNOWN, direction))
            continue

        parsed = parse_reporting_period(point.reporting_period)
        if parsed is None:
            comparisons.append(_not_comparable(metric, REASON_PERIOD_NOT_PARSEABLE, direction))
            continue

        candidates = find_benchmarks_for_scope(
            db,
            country=project.country,
            property_type=project.property_type,
            metric_names=canonical.names,
            max_year=parsed[0],
        )
        if not candidates:
            comparisons.append(_not_comparable(metric, REASON_NO_BENCHMARK_FOR_SCOPE, direction))
            continue

        # Candidates are newest-first; take the newest whose unit can be expressed in
        # the canonical unit. Only the documented conversions in canonical.py are
        # applied - an assumed factor is exactly the kind of invisible judgement that
        # makes a sustainability comparison indefensible.
        benchmark = None
        benchmark_value = None
        for row in candidates:
            converted = to_canonical_value(row.value, row.unit, canonical)
            if converted is not None:
                benchmark, benchmark_value = row, converted
                break
        if benchmark is None:
            comparisons.append(_not_comparable(metric, REASON_UNIT_MISMATCH, direction))
            continue

        if benchmark_value == 0:
            # A zero target makes the percentage difference undefined.
            comparisons.append(_not_comparable(metric, REASON_BENCHMARK_NOT_USABLE, direction))
            continue

        difference_percent = (measured - benchmark_value) / benchmark_value * 100.0
        comparisons.append(
            BenchmarkComparison(
                metric_name=canonical.label,
                reporting_period=point.reporting_period,
                submission_id=point.submission_id,
                value=measured,
                unit=canonical.unit,
                direction=direction,
                benchmark_value=benchmark_value,
                benchmark_unit=canonical.unit,
                source=BenchmarkSource(
                    provider=benchmark.provider,
                    source_name=benchmark.source_name,
                    source_version=benchmark.source_version,
                    source_url=benchmark.source_url,
                    country=benchmark.country,
                    property_type=benchmark.property_type,
                    year=benchmark.year,
                ),
                difference_percent=difference_percent,
                classification=classify(difference_percent, direction),
                reason=None,
            )
        )

    return BenchmarkReport(
        project_id=project.id,
        project_name=project.name,
        organisation_name=project.organisation.name,
        country=project.country,
        property_type=project.property_type,
        tolerance_percent=AT_TARGET_TOLERANCE_PERCENT,
        comparisons=comparisons,
    )


def get_consistency_report(project_id: int, *, db: Session) -> ConsistencyReport:
    """Reporting consistency: which metric x period cells have approved data.

    This measures how completely and how reliably a project has reported - not how
    sustainable it is. The two are easy to confuse, so the API deliberately exposes
    the raw counts alongside the percentage and the UI labels it as reporting
    coverage rather than a performance score.

    Periods whose reporting_period cannot be parsed are excluded, matching the
    performance service - an unplaceable period has no column on a time axis.
    """
    _require_project(db, project_id)

    submissions = list_submissions_for_project(
        db, project_id, [SUBMISSION_STATUS_APPROVED, SUBMISSION_STATUS_UNREVIEWED]
    )

    period_keys: dict[str, tuple[int, int]] = {}
    metric_names: set[str] = set()
    # (metric, period) -> best observation so far. APPROVED always wins over
    # UNREVIEWED; within a status the most recently created submission wins.
    observed: dict[tuple[str, str], tuple[str, float, str, int, object]] = {}

    for submission in submissions:
        parsed = parse_reporting_period(submission.reporting_period)
        if parsed is None:
            continue
        period_keys[submission.reporting_period] = parsed

        for metric in submission.metrics:
            # Group by canonical name so "Electricity" and "electricity_consumption"
            # are one row, and show the canonical unit so a column is comparable
            # down its length. Unknown metrics keep their reported name and unit.
            canonical = resolve_metric(metric.metric_name)
            label = canonical.label if canonical else metric.metric_name
            if canonical is None:
                value, unit = metric.value, metric.unit
            else:
                converted = to_canonical_value(metric.value, metric.unit, canonical)
                # An unconvertible unit still counts as reported; the value is
                # withheld rather than shown in a unit the column does not use.
                value = converted
                unit = canonical.unit if converted is not None else metric.unit

            metric_names.add(label)
            key = (label, submission.reporting_period)
            candidate = (
                submission.status,
                value,
                unit,
                submission.id,
                submission.created_at,
            )
            current = observed.get(key)
            if current is None or _beats(candidate, current):
                observed[key] = candidate

    periods = sorted(period_keys, key=lambda period: period_keys[period])
    metrics = sorted(metric_names)

    cells: list[ConsistencyCell] = []
    approved_cells = 0
    for metric_name in metrics:
        for period in periods:
            found = observed.get((metric_name, period))
            if found is None:
                cells.append(
                    ConsistencyCell(
                        metric_name=metric_name,
                        reporting_period=period,
                        state=CELL_MISSING,
                        value=None,
                        unit=None,
                        submission_id=None,
                    )
                )
                continue
            status, value, unit, submission_id, _ = found
            state = CELL_APPROVED if status == SUBMISSION_STATUS_APPROVED else CELL_UNREVIEWED
            if state == CELL_APPROVED:
                approved_cells += 1
            cells.append(
                ConsistencyCell(
                    metric_name=metric_name,
                    reporting_period=period,
                    state=state,
                    value=value,
                    unit=unit,
                    submission_id=submission_id,
                )
            )

    total_cells = len(metrics) * len(periods)
    coverage = (approved_cells / total_cells * 100.0) if total_cells else None

    return ConsistencyReport(
        project_id=project_id,
        metrics=metrics,
        periods=periods,
        cells=cells,
        approved_cells=approved_cells,
        total_cells=total_cells,
        approved_coverage_percent=coverage,
    )


def _beats(candidate, current) -> bool:
    candidate_approved = candidate[0] == SUBMISSION_STATUS_APPROVED
    current_approved = current[0] == SUBMISSION_STATUS_APPROVED
    if candidate_approved != current_approved:
        return candidate_approved
    return candidate[4] > current[4]

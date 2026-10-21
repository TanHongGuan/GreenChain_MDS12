"""Reporting consistency: which metric x period cells have data, by review state."""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from backend.app.insights.canonical import resolve_metric, to_canonical_value
from backend.app.insights.errors import ProjectNotFound
from backend.app.models.submission import (
    SUBMISSION_STATUS_APPROVED,
    SUBMISSION_STATUS_UNREVIEWED,
)
from backend.app.performance.periods import parse_reporting_period
from backend.app.repositories.projects import get_project_by_id
from backend.app.repositories.submissions import list_submissions_for_project

CELL_APPROVED = "APPROVED"
CELL_UNREVIEWED = "UNREVIEWED"
CELL_MISSING = "MISSING"


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

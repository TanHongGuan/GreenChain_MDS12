from dataclasses import dataclass

from sqlalchemy.orm import Session

from backend.app.models.metric import Metric
from backend.app.models.submission import (
    SUBMISSION_STATUS_APPROVED,
    SUBMISSION_STATUS_UNREVIEWED,
    Submission,
)
from backend.app.performance.errors import MetricUnitConflict, ProjectNotFound
from backend.app.performance.periods import parse_reporting_period
from backend.app.repositories.projects import get_project_by_id
from backend.app.repositories.submissions import list_submissions_for_project


@dataclass(frozen=True)
class ProjectSummary:
    project_id: int
    project_name: str
    organisation_id: str
    organisation_name: str


@dataclass(frozen=True)
class MetricPoint:
    submission_id: int
    project_id: int
    metric_name: str
    reporting_period: str
    value: float
    unit: str
    category: str | None
    status: str


@dataclass(frozen=True)
class LatestMetric:
    metric_name: str
    latest: MetricPoint
    previous: MetricPoint | None


def _require_project(db: Session, project_id: int):
    project = get_project_by_id(db, project_id)
    if project is None:
        raise ProjectNotFound(f"Project {project_id} was not found.")
    return project


def _to_point(submission: Submission, metric: Metric) -> MetricPoint:
    return MetricPoint(
        submission_id=submission.id,
        project_id=submission.project_id,
        metric_name=metric.metric_name,
        reporting_period=submission.reporting_period,
        value=metric.value,
        unit=metric.unit,
        category=metric.category,
        status=submission.status,
    )


def _ordered_submissions(
    db: Session, project_id: int, statuses: list[str], *, descending: bool
) -> list[Submission]:
    """Submissions for the project, chronologically ordered by parsed reporting period.

    Submissions whose reporting_period cannot be parsed are excluded rather than
    guessed into an arbitrary position (see performance/periods.py). Ties on the
    same period are broken by created_at (most recent upload wins).
    """
    submissions = list_submissions_for_project(db, project_id, statuses)
    dated = [(submission, parse_reporting_period(submission.reporting_period)) for submission in submissions]
    dated = [(submission, key) for submission, key in dated if key is not None]
    dated.sort(key=lambda pair: (pair[1], pair[0].created_at), reverse=descending)
    return [submission for submission, _ in dated]


def get_project_detail(project_id: int, *, db: Session) -> ProjectSummary:
    project = _require_project(db, project_id)
    return ProjectSummary(
        project_id=project.id,
        project_name=project.name,
        organisation_id=project.organisation_id,
        organisation_name=project.organisation.name,
    )


def get_latest_approved_metrics(project_id: int, *, db: Session) -> list[LatestMetric]:
    _require_project(db, project_id)

    submissions_desc = _ordered_submissions(db, project_id, [SUBMISSION_STATUS_APPROVED], descending=True)

    latest: dict[str, MetricPoint] = {}
    previous: dict[str, MetricPoint] = {}
    for submission in submissions_desc:
        for metric in submission.metrics:
            point = _to_point(submission, metric)
            if metric.metric_name not in latest:
                latest[metric.metric_name] = point
            elif metric.metric_name not in previous and point.unit == latest[metric.metric_name].unit:
                # Only treat an earlier period as "previous" if its unit matches the
                # latest value's unit - comparing across incompatible units without a
                # defined conversion would be misleading, so we keep looking further
                # back instead of surfacing a bogus comparison.
                previous[metric.metric_name] = point

    return [
        LatestMetric(metric_name=metric_name, latest=point, previous=previous.get(metric_name))
        for metric_name, point in latest.items()
    ]


def get_metric_history(
    project_id: int,
    metric_name: str,
    *,
    db: Session,
    include_unreviewed: bool = False,
) -> list[MetricPoint]:
    _require_project(db, project_id)

    statuses = [SUBMISSION_STATUS_APPROVED]
    if include_unreviewed:
        statuses.append(SUBMISSION_STATUS_UNREVIEWED)

    submissions_asc = _ordered_submissions(db, project_id, statuses, descending=False)

    points: list[MetricPoint] = []
    series_unit: str | None = None
    for submission in submissions_asc:
        for metric in submission.metrics:
            if metric.metric_name != metric_name:
                continue
            point = _to_point(submission, metric)
            if series_unit is None:
                series_unit = point.unit
            elif point.unit != series_unit:
                raise MetricUnitConflict(
                    f"Metric '{metric_name}' has inconsistent units ({series_unit} vs {point.unit}) "
                    f"in project {project_id}; refusing to combine incompatible units."
                )
            points.append(point)

    return points

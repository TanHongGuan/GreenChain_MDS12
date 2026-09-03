from dataclasses import dataclass, replace
from datetime import datetime

from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from backend.app.models.highlighted_project import HighlightedProject
from backend.app.models.metric import Metric
from backend.app.models.organisation import Organisation
from backend.app.models.project import Project
from backend.app.models.submission import SUBMISSION_STATUS_APPROVED, Submission
from backend.app.performance.periods import parse_reporting_period
from backend.app.repositories.projects import get_project_by_id

DEFAULT_SECTION_LIMIT = 4
CANONICAL_METRIC_ORDER = ("Electricity", "Water", "CO2e", "Waste")


class DiscoveryError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class TrustedMetricSummary:
    metric_name: str
    value: float
    unit: str
    category: str | None
    reporting_period: str
    submission_id: int


@dataclass(frozen=True)
class ProjectCard:
    project_id: int
    project_name: str
    organisation: str
    location: str | None
    status: str | None
    latest_reporting_period: str | None
    updated_at: datetime | None
    created_at: datetime
    highlighted: bool
    trusted_metric: TrustedMetricSummary | None


@dataclass(frozen=True)
class DiscoveryResult:
    recently_updated: list[ProjectCard]
    featured: list[ProjectCard]
    new_projects: list[ProjectCard]
    featured_rule: str


def get_home_discovery(*, db: Session, user_id: str, limit: int = DEFAULT_SECTION_LIMIT) -> DiscoveryResult:
    return DiscoveryResult(
        recently_updated=get_recently_updated(db=db, user_id=user_id, limit=limit),
        featured=get_featured_projects(db=db, user_id=user_id, limit=limit),
        new_projects=get_new_projects(db=db, user_id=user_id, limit=limit),
        featured_rule=featured_rule(),
    )


def featured_rule() -> str:
    return (
        "No explicit featured flag exists; featured projects are projects whose latest catalogue status is approved, "
        "ordered by that trusted reporting period descending and then project name."
    )


def get_recently_updated(*, db: Session, user_id: str, limit: int = DEFAULT_SECTION_LIMIT) -> list[ProjectCard]:
    latest = _latest_submission_subquery()
    stmt = (
        _base_project_card_query(latest)
        .where(latest.c.row_number == 1)
        .order_by(latest.c.submitted_at.desc(), Project.id.asc())
        .limit(_validate_limit(limit))
    )
    return _cards_from_rows(db=db, user_id=user_id, rows=db.execute(stmt).all())


def get_new_projects(*, db: Session, user_id: str, limit: int = DEFAULT_SECTION_LIMIT) -> list[ProjectCard]:
    latest = _latest_submission_subquery()
    stmt = (
        _base_project_card_query(latest)
        .where(latest.c.row_number == 1)
        .order_by(Project.created_at.desc(), Project.id.asc())
        .limit(_validate_limit(limit))
    )
    return _cards_from_rows(db=db, user_id=user_id, rows=db.execute(stmt).all())


def get_featured_projects(*, db: Session, user_id: str, limit: int = DEFAULT_SECTION_LIMIT) -> list[ProjectCard]:
    latest = _latest_submission_subquery()
    stmt = (
        _base_project_card_query(latest)
        .where(latest.c.row_number == 1, latest.c.status == SUBMISSION_STATUS_APPROVED)
        .order_by(latest.c.reporting_period.desc(), func.lower(Project.name).asc(), Project.id.asc())
        .limit(_validate_limit(limit))
    )
    return _cards_from_rows(db=db, user_id=user_id, rows=db.execute(stmt).all())


def list_highlighted_projects(*, db: Session, user_id: str, limit: int = 50) -> list[ProjectCard]:
    latest = _latest_submission_subquery()
    stmt = (
        _base_project_card_query(latest)
        .join(HighlightedProject, HighlightedProject.project_id == Project.id)
        .where(HighlightedProject.user_id == user_id, latest.c.row_number == 1)
        .order_by(HighlightedProject.created_at.desc(), Project.id.asc())
        .limit(_validate_limit(limit, maximum=50))
    )
    return _cards_from_rows(db=db, user_id=user_id, rows=db.execute(stmt).all())


def add_highlight(*, db: Session, user_id: str, project_id: int) -> ProjectCard:
    _require_project(db, project_id)
    existing = db.scalars(
        select(HighlightedProject).where(
            HighlightedProject.user_id == user_id,
            HighlightedProject.project_id == project_id,
        )
    ).first()
    if existing is None:
        try:
            with db.begin_nested():
                db.add(HighlightedProject(user_id=user_id, project_id=project_id))
        except IntegrityError:
            pass
    card = _card_for_project(db=db, user_id=user_id, project_id=project_id)
    if card is None:
        raise DiscoveryError("PROJECT_NOT_FOUND", "Project was not found.")
    return replace(card, highlighted=True)


def remove_highlight(*, db: Session, user_id: str, project_id: int) -> bool:
    highlight = db.scalars(
        select(HighlightedProject).where(
            HighlightedProject.user_id == user_id,
            HighlightedProject.project_id == project_id,
        )
    ).first()
    if highlight is None:
        return False
    db.delete(highlight)
    db.flush()
    return True


def _latest_submission_subquery():
    row_number = func.row_number().over(
        partition_by=Submission.project_id,
        order_by=(Submission.created_at.desc(), Submission.id.desc()),
    )
    return (
        select(
            Submission.id.label("submission_id"),
            Submission.project_id.label("project_id"),
            Submission.status.label("status"),
            Submission.reporting_period.label("reporting_period"),
            Submission.created_at.label("submitted_at"),
            row_number.label("row_number"),
        ).subquery()
    )


def _base_project_card_query(latest) -> Select:
    return (
        select(
            Project.id.label("project_id"),
            Project.name.label("project_name"),
            Project.location.label("location"),
            Project.created_at.label("created_at"),
            Organisation.name.label("organisation"),
            latest.c.status.label("status"),
            latest.c.reporting_period.label("latest_reporting_period"),
            latest.c.submitted_at.label("updated_at"),
        )
        .join(Organisation, Organisation.id == Project.organisation_id)
        .join(latest, latest.c.project_id == Project.id)
    )


def _cards_from_rows(*, db: Session, user_id: str, rows) -> list[ProjectCard]:
    project_ids = [row.project_id for row in rows]
    highlighted_ids = _highlighted_project_ids(db, user_id=user_id, project_ids=project_ids)
    trusted_metrics = _trusted_metric_summaries(db, project_ids=project_ids)
    return [
        ProjectCard(
            project_id=row.project_id,
            project_name=row.project_name,
            organisation=row.organisation,
            location=row.location,
            status=row.status,
            latest_reporting_period=row.latest_reporting_period,
            updated_at=row.updated_at,
            created_at=row.created_at,
            highlighted=row.project_id in highlighted_ids,
            trusted_metric=trusted_metrics.get(row.project_id),
        )
        for row in rows
    ]


def _card_for_project(*, db: Session, user_id: str, project_id: int) -> ProjectCard | None:
    latest = _latest_submission_subquery()
    stmt = _base_project_card_query(latest).where(Project.id == project_id, latest.c.row_number == 1)
    row = db.execute(stmt).first()
    if row is None:
        return None
    return _cards_from_rows(db=db, user_id=user_id, rows=[row])[0]


def _highlighted_project_ids(db: Session, *, user_id: str, project_ids: list[int]) -> set[int]:
    if not project_ids:
        return set()
    stmt = select(HighlightedProject.project_id).where(
        HighlightedProject.user_id == user_id,
        HighlightedProject.project_id.in_(project_ids),
    )
    return set(db.scalars(stmt).all())


def _trusted_metric_summaries(db: Session, *, project_ids: list[int]) -> dict[int, TrustedMetricSummary]:
    if not project_ids:
        return {}
    submissions = list(
        db.scalars(
            select(Submission)
            .where(Submission.project_id.in_(project_ids), Submission.status == SUBMISSION_STATUS_APPROVED)
            .options(selectinload(Submission.metrics))
        )
        .unique()
        .all()
    )
    latest_by_project: dict[int, Submission] = {}
    for submission in submissions:
        period_key = parse_reporting_period(submission.reporting_period)
        if period_key is None:
            continue
        current = latest_by_project.get(submission.project_id)
        current_key = parse_reporting_period(current.reporting_period) if current is not None else None
        current_tuple = (current_key, current.created_at, current.id) if current_key is not None else None
        candidate_tuple = (period_key, submission.created_at, submission.id)
        if current_tuple is None or candidate_tuple > current_tuple:
            latest_by_project[submission.project_id] = submission

    summaries: dict[int, TrustedMetricSummary] = {}
    for project_id, submission in latest_by_project.items():
        summary = _metric_summary_for_submission(submission)
        if summary is not None:
            summaries[project_id] = summary
    return summaries


def _metric_summary_for_submission(submission: Submission) -> TrustedMetricSummary | None:
    metrics = sorted(
        submission.metrics,
        key=lambda metric: (
            CANONICAL_METRIC_ORDER.index(metric.metric_name)
            if metric.metric_name in CANONICAL_METRIC_ORDER
            else len(CANONICAL_METRIC_ORDER),
            metric.metric_name.lower(),
            metric.id,
        ),
    )
    if not metrics:
        return None
    metric: Metric = metrics[0]
    return TrustedMetricSummary(
        metric_name=metric.metric_name,
        value=metric.value,
        unit=metric.unit,
        category=metric.category,
        reporting_period=submission.reporting_period,
        submission_id=submission.id,
    )


def _require_project(db: Session, project_id: int) -> Project:
    project = get_project_by_id(db, project_id)
    if project is None:
        raise DiscoveryError("PROJECT_NOT_FOUND", "Project was not found.")
    return project


def _validate_limit(limit: int, *, maximum: int = 12) -> int:
    if limit < 1:
        raise DiscoveryError("INVALID_LIMIT", "Limit must be 1 or greater.")
    return min(limit, maximum)

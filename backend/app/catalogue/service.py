from dataclasses import dataclass
from datetime import datetime
from math import ceil

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from backend.app.models.organisation import Organisation
from backend.app.models.project import Project
from backend.app.models.submission import (
    SUBMISSION_STATUS_APPROVED,
    SUBMISSION_STATUS_REJECTED,
    SUBMISSION_STATUS_UNREVIEWED,
    Submission,
)
from backend.app.performance.periods import parse_reporting_period

ALLOWED_STATUSES = {
    SUBMISSION_STATUS_APPROVED,
    SUBMISSION_STATUS_UNREVIEWED,
    SUBMISSION_STATUS_REJECTED,
}
DEFAULT_STATUSES = (SUBMISSION_STATUS_APPROVED,)
MAX_PAGE_SIZE = 50
DEFAULT_PAGE_SIZE = 12


class CatalogueError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class CatalogueItem:
    project_id: int
    project_name: str
    organisation: str
    location: str | None
    status: str
    reporting_period: str
    submission_id: int
    submitted_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class FilterOption:
    value: str
    count: int


@dataclass(frozen=True)
class CatalogueResult:
    items: list[CatalogueItem]
    page: int
    page_size: int
    total_items: int
    total_pages: int
    filters: dict[str, list[FilterOption]]


def list_projects(
    *,
    db: Session,
    search: str | None = None,
    location: str | None = None,
    organisation: str | None = None,
    statuses: list[str] | None = None,
    reporting_period: str | None = None,
    sort: str | None = None,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> CatalogueResult:
    selected_statuses = _normalise_statuses(statuses)
    page = _validate_page(page)
    page_size = _validate_page_size(page_size)
    selected_period = _normalise_reporting_period(reporting_period)
    sort_key = sort or "updated_desc"

    latest = _latest_submission_subquery()
    base = _base_query(latest)
    base = _apply_filters(
        base,
        latest=latest,
        search=search,
        location=location,
        organisation=organisation,
        statuses=selected_statuses,
        reporting_period=selected_period,
    )

    total_items = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    total_pages = ceil(total_items / page_size) if total_items else 0
    stmt = _apply_sort(base, latest=latest, sort=sort_key).offset((page - 1) * page_size).limit(page_size)

    rows = db.execute(stmt).all()
    items = [
        CatalogueItem(
            project_id=row.project_id,
            project_name=row.project_name,
            organisation=row.organisation,
            location=row.location,
            status=row.status,
            reporting_period=row.reporting_period,
            submission_id=row.submission_id,
            submitted_at=row.submitted_at,
            updated_at=row.updated_at,
        )
        for row in rows
    ]

    return CatalogueResult(
        items=items,
        page=page,
        page_size=page_size,
        total_items=total_items,
        total_pages=total_pages,
        filters=_load_filter_options(db, latest=latest),
    )


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
        )
        .subquery()
    )


def _base_query(latest) -> Select:
    return (
        select(
            Project.id.label("project_id"),
            Project.name.label("project_name"),
            Organisation.name.label("organisation"),
            Project.location.label("location"),
            latest.c.status.label("status"),
            latest.c.reporting_period.label("reporting_period"),
            latest.c.submission_id.label("submission_id"),
            latest.c.submitted_at.label("submitted_at"),
            latest.c.submitted_at.label("updated_at"),
        )
        .join(Organisation, Organisation.id == Project.organisation_id)
        .join(latest, latest.c.project_id == Project.id)
        .where(latest.c.row_number == 1)
    )


def _apply_filters(
    stmt: Select,
    *,
    latest,
    search: str | None,
    location: str | None,
    organisation: str | None,
    statuses: tuple[str, ...],
    reporting_period: str | None,
) -> Select:
    stmt = stmt.where(latest.c.status.in_(statuses))
    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        stmt = stmt.where(or_(func.lower(Project.name).like(term), func.lower(Organisation.name).like(term)))
    if location and location.strip():
        stmt = stmt.where(func.lower(Project.location) == location.strip().lower())
    if organisation and organisation.strip():
        stmt = stmt.where(func.lower(Organisation.name) == organisation.strip().lower())
    if reporting_period:
        stmt = stmt.where(latest.c.reporting_period == reporting_period)
    return stmt


def _apply_sort(stmt: Select, *, latest, sort: str) -> Select:
    sort_map = {
        "updated_desc": (latest.c.submitted_at.desc(), Project.id.asc()),
        "updated_asc": (latest.c.submitted_at.asc(), Project.id.asc()),
        "project_name_asc": (func.lower(Project.name).asc(), Project.id.asc()),
        "project_name_desc": (func.lower(Project.name).desc(), Project.id.asc()),
        "organisation_asc": (func.lower(Organisation.name).asc(), func.lower(Project.name).asc(), Project.id.asc()),
        "organisation_desc": (func.lower(Organisation.name).desc(), func.lower(Project.name).asc(), Project.id.asc()),
        "location_asc": (func.lower(Project.location).asc(), func.lower(Project.name).asc(), Project.id.asc()),
        "location_desc": (func.lower(Project.location).desc(), func.lower(Project.name).asc(), Project.id.asc()),
        "period_asc": (latest.c.reporting_period.asc(), Project.id.asc()),
        "period_desc": (latest.c.reporting_period.desc(), Project.id.asc()),
    }
    if sort not in sort_map:
        raise CatalogueError("INVALID_SORT", "Unsupported project catalogue sort.")
    return stmt.order_by(*sort_map[sort])


def _load_filter_options(db: Session, *, latest) -> dict[str, list[FilterOption]]:
    base = (
        select(
            Organisation.name.label("organisation"),
            Project.location.label("location"),
            latest.c.status.label("status"),
            latest.c.reporting_period.label("reporting_period"),
        )
        .join(Organisation, Organisation.id == Project.organisation_id)
        .join(latest, latest.c.project_id == Project.id)
        .where(latest.c.row_number == 1)
        .subquery()
    )
    return {
        "organisations": _group_options(db, base.c.organisation),
        "locations": _group_options(db, base.c.location),
        "statuses": _group_options(db, base.c.status),
        "reporting_periods": _group_options(db, base.c.reporting_period),
    }


def _group_options(db: Session, column) -> list[FilterOption]:
    rows = db.execute(
        select(column.label("value"), func.count().label("count"))
        .where(column.is_not(None), column != "")
        .group_by(column)
        .order_by(func.lower(column).asc())
    ).all()
    return [FilterOption(value=row.value, count=row.count) for row in rows]


def _normalise_statuses(statuses: list[str] | None) -> tuple[str, ...]:
    if statuses is None:
        return DEFAULT_STATUSES
    normalised = tuple(status.strip().upper() for status in statuses if status and status.strip())
    if not normalised:
        return DEFAULT_STATUSES
    invalid = sorted(set(normalised) - ALLOWED_STATUSES)
    if invalid:
        raise CatalogueError("INVALID_STATUS", "Unsupported project catalogue status filter.")
    return normalised


def _normalise_reporting_period(reporting_period: str | None) -> str | None:
    if reporting_period is None or not reporting_period.strip():
        return None
    clean = reporting_period.strip()
    if parse_reporting_period(clean) is None:
        raise CatalogueError("INVALID_REPORTING_PERIOD", "Reporting period must use YYYY-Qn format.")
    return clean


def _validate_page(page: int) -> int:
    if page < 1:
        raise CatalogueError("INVALID_PAGE", "Page must be 1 or greater.")
    return page


def _validate_page_size(page_size: int) -> int:
    if page_size < 1 or page_size > MAX_PAGE_SIZE:
        raise CatalogueError("INVALID_PAGE_SIZE", f"Page size must be between 1 and {MAX_PAGE_SIZE}.")
    return page_size

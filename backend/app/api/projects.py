from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from backend.app.auth.dependencies import get_current_user
from backend.app.auth.dependencies import require_permission
from backend.app.auth.permissions import Permission
from backend.app.auth.models import AuthUser
from backend.app.catalogue.service import (
    CatalogueError,
    CatalogueItem,
    FilterOption,
    list_projects as list_catalogue_projects,
)
from backend.app.core.database import get_db
from backend.app.core.errors import api_error
from backend.app.performance.errors import MetricUnitConflict, ProjectNotFound
from backend.app.performance.service import (
    LatestMetric,
    MetricPoint,
    get_latest_approved_metrics,
    get_metric_history,
    get_project_detail,
)
from backend.app.models.project import Project
from backend.app.models.organisation import Organisation
from backend.app.models.user import User
from backend.app.auth.models import UserRole
from backend.app.models.monthly_record import MonthlyRecord
from backend.app.models.submission import Submission, SUBMISSION_STATUS_APPROVED

router = APIRouter(prefix="/projects", tags=["projects"])


class OwnedBuildingInput(BaseModel):
    name: str
    location: str | None = None
    country: str | None = None
    property_type: str | None = None


class OwnedBuildingEdit(BaseModel):
    """The only two fields a company may change about its own building.

    Country and property type are deliberately absent: they are set when the
    building is created and are not part of what this screen may edit.
    """

    name: str
    location: str | None = None


def _auditor_summary(user: User | None) -> dict | None:
    if user is None:
        return None
    return {"id": user.id, "name": user.name, "email": user.email}


def _owned_building(project: Project, organisation: Organisation, summary: dict | None = None) -> dict:
    building = {
        "project_id": project.id, "project_name": project.name,
        "organisation_id": project.organisation_id, "organisation": organisation.name,
        "location": project.location, "country": project.country,
        "property_type": project.property_type,
    }
    if summary is not None:
        # Counted from the submissions actually stored, never estimated. A building
        # with no submissions reports zero and no latest period, rather than
        # inventing either.
        building.update(summary)
    return building


def _submission_summaries(db: Session, project_ids: list[int]) -> dict[int, dict]:
    """Submission count and most recent submission for each building, in one pass."""
    summaries = {project_id: {"submission_count": 0, "latest_submission": None} for project_id in project_ids}
    if not project_ids:
        return summaries
    rows = db.scalars(
        select(Submission).where(Submission.project_id.in_(project_ids)).order_by(Submission.created_at, Submission.id)
    ).all()
    for submission in rows:
        entry = summaries[submission.project_id]
        entry["submission_count"] += 1
        entry["latest_submission"] = {
            "submission_id": submission.id,
            "reporting_period": submission.reporting_period,
            "status": submission.status,
            "submitted_at": submission.created_at.isoformat() if submission.created_at else None,
        }
    return summaries


def _validated_building_fields(payload: OwnedBuildingInput | OwnedBuildingEdit, organisation: Organisation,
                               db: Session, *, project_id: int | None = None) -> tuple[str, dict]:
    """Shared by create and edit so one set of rules governs both."""
    name = payload.name.strip()
    if not name or len(name) > 255:
        raise api_error(status.HTTP_400_BAD_REQUEST, "INVALID_NAME", "Building name must be 1 to 255 characters.")
    clash = select(Project.id).where(Project.organisation_id == organisation.id, func.lower(Project.name) == name.lower())
    if project_id is not None:
        clash = clash.where(Project.id != project_id)
    if db.scalar(clash) is not None:
        raise api_error(status.HTTP_409_CONFLICT, "DUPLICATE_BUILDING", "This organisation already has a building with that name.")
    fields = {key: (value.strip() or None) if value is not None else None
              for key, value in payload.model_dump(exclude={"name"}).items()}
    if any(value and len(value) > (255 if key == "location" else 128) for key, value in fields.items()):
        raise api_error(status.HTTP_400_BAD_REQUEST, "INVALID_METADATA", "Building metadata is too long.")
    return name, fields


@router.get("/owned")
def owned_buildings(
    current_user: AuthUser = Depends(require_permission(Permission.UPLOAD_SUBMISSION)),
    db: Session = Depends(get_db),
) -> dict:
    if not current_user.organisation_id:
        return {"buildings": []}
    organisation = db.get(Organisation, current_user.organisation_id)
    if organisation is None:
        return {"buildings": []}
    projects = db.scalars(select(Project).where(Project.organisation_id == organisation.id).order_by(Project.name, Project.id)).all()
    summaries = _submission_summaries(db, [project.id for project in projects])
    return {"buildings": [_owned_building(project, organisation, summaries[project.id]) for project in projects]}


@router.post("/owned", status_code=status.HTTP_201_CREATED)
def create_owned_building(
    payload: OwnedBuildingInput,
    current_user: AuthUser = Depends(require_permission(Permission.UPLOAD_SUBMISSION)),
    db: Session = Depends(get_db),
) -> dict:
    organisation = db.get(Organisation, current_user.organisation_id) if current_user.organisation_id else None
    if organisation is None:
        raise api_error(status.HTTP_403_FORBIDDEN, "ORGANISATION_REQUIRED", "An organisation is required.")
    name, fields = _validated_building_fields(payload, organisation, db)
    project = Project(name=name, organisation_id=organisation.id, **fields)
    db.add(project)
    db.commit()
    db.refresh(project)
    return {"building": _owned_building(project, organisation, {"submission_count": 0, "latest_submission": None})}


@router.patch("/owned/{project_id}")
def update_owned_building(
    project_id: int,
    payload: OwnedBuildingEdit,
    current_user: AuthUser = Depends(require_permission(Permission.UPLOAD_SUBMISSION)),
    db: Session = Depends(get_db),
) -> dict:
    """Rename a building or correct its address. Nothing else about it may change.

    Only the two editable fields are written. Submissions, evidence, monthly
    records and review history reference the building by id, so they are
    untouched by a rename - and nothing here deletes anything.

    A building belonging to another organisation reports as not found rather than
    forbidden, so this cannot be used to discover that it exists.
    """
    organisation = db.get(Organisation, current_user.organisation_id) if current_user.organisation_id else None
    if organisation is None:
        raise api_error(status.HTTP_403_FORBIDDEN, "ORGANISATION_REQUIRED", "An organisation is required.")
    project = db.get(Project, project_id)
    if project is None or project.organisation_id != organisation.id:
        raise api_error(status.HTTP_404_NOT_FOUND, "PROJECT_NOT_FOUND", "Building was not found.")

    name, fields = _validated_building_fields(payload, organisation, db, project_id=project_id)
    project.name = name
    project.location = fields["location"]
    db.commit()
    db.refresh(project)
    summaries = _submission_summaries(db, [project.id])
    return {"building": _owned_building(project, organisation, summaries[project.id])}


@router.get("/auditors")
def available_auditors(
    _: AuthUser = Depends(require_permission(Permission.UPLOAD_SUBMISSION)),
    db: Session = Depends(get_db),
) -> dict:
    """The auditors a company may appoint.

    Auditors belong to no organisation - they review across all of them - so this
    is every active auditor rather than a per-tenant list.
    """
    auditors = db.scalars(
        select(User).where(User.role == UserRole.AUDITOR.value, User.is_active.is_(True))
        .order_by(User.name, User.id)
    ).all()
    return {"auditors": [_auditor_summary(auditor) for auditor in auditors]}


@router.get("")
def list_projects(
    search: str | None = None,
    location: str | None = None,
    organisation: str | None = None,
    reporting_period: str | None = None,
    status_filter: list[str] | None = Query(default=None, alias="status"),
    sort: str | None = None,
    page: int = 1,
    page_size: int = 12,
    _: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    try:
        result = list_catalogue_projects(
            db=db,
            search=search,
            location=location,
            organisation=organisation,
            statuses=_parse_status_filters(status_filter),
            reporting_period=reporting_period,
            sort=sort,
            page=page,
            page_size=page_size,
        )
    except CatalogueError as exc:
        raise api_error(status.HTTP_400_BAD_REQUEST, exc.code, exc.message) from exc

    return {
        "projects": [_serialize_catalogue_item(project) for project in result.items],
        "page": result.page,
        "page_size": result.page_size,
        "total_items": result.total_items,
        "total_pages": result.total_pages,
        "filters": {
            name: [_serialize_filter_option(option) for option in options]
            for name, options in result.filters.items()
        },
    }


def _parse_status_filters(status_filters: list[str] | None) -> list[str] | None:
    if status_filters is None:
        return None
    statuses: list[str] = []
    for value in status_filters:
        statuses.extend(part.strip() for part in value.split(",") if part.strip())
    return statuses


def _serialize_catalogue_item(project: CatalogueItem) -> dict:
    return {
        "project_id": project.project_id,
        "project_name": project.project_name,
        "organisation": project.organisation,
        "location": project.location,
        "status": project.status,
        "reporting_period": project.reporting_period,
        "submission_id": project.submission_id,
        "submitted_at": project.submitted_at.isoformat(),
        "updated_at": project.updated_at.isoformat(),
    }


def _serialize_filter_option(option: FilterOption) -> dict:
    return {"value": option.value, "count": option.count}


def _serialize_point(point: MetricPoint | None) -> dict | None:
    if point is None:
        return None
    return {
        "submission_id": point.submission_id,
        "reporting_period": point.reporting_period,
        "value": point.value,
        "unit": point.unit,
        "category": point.category,
        "status": point.status,
    }


def _serialize_latest_metric(metric: LatestMetric) -> dict:
    return {
        "metric_name": metric.metric_name,
        "latest": _serialize_point(metric.latest),
        "previous": _serialize_point(metric.previous),
    }


@router.get("/{project_id}/monthly")
def approved_monthly_history(
    project_id: int,
    _: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if db.get(Project, project_id) is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "PROJECT_NOT_FOUND", "Project was not found.")
    records = db.execute(
        select(MonthlyRecord, Submission)
        .join(Submission, MonthlyRecord.submission_id == Submission.id)
        .where(MonthlyRecord.project_id == project_id, Submission.status == SUBMISSION_STATUS_APPROVED)
        .order_by(MonthlyRecord.reporting_period, Submission.created_at.desc(), Submission.id.desc())
    ).all()
    latest_by_month = {}
    for row, submission in records:
        latest_by_month.setdefault(row.reporting_period, (row, submission))
    return {
        "project_id": project_id,
        "monthly_records": [
            {"submission_id": submission.id, "reporting_period": period,
             "electricity_kwh": str(row.electricity_kwh), "water_m3": str(row.water_m3),
             "co2_tco2e": str(row.co2_tco2e)}
            for period, (row, submission) in sorted(latest_by_month.items())
        ],
    }


@router.get("/{project_id}")
def project_detail(
    project_id: int,
    _: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    try:
        summary = get_project_detail(project_id, db=db)
        metrics = get_latest_approved_metrics(project_id, db=db)
    except ProjectNotFound as exc:
        raise api_error(status.HTTP_404_NOT_FOUND, "PROJECT_NOT_FOUND", "Project was not found.") from exc

    return {
        "project": {
            "project_id": summary.project_id,
            "project_name": summary.project_name,
            "organisation": summary.organisation_name,
        },
        "metrics": [_serialize_latest_metric(metric) for metric in metrics],
    }


@router.get("/{project_id}/metrics/{metric_name}/history")
def metric_history(
    project_id: int,
    metric_name: str,
    include_unreviewed: bool = False,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    # Viewers see reviewed performance only. Unreviewed figures are for the
    # company that filed them and the auditors reviewing them, so a viewer's
    # request for them is answered with approved points alone.
    if current_user.role == UserRole.VIEWER:
        include_unreviewed = False
    try:
        points = get_metric_history(project_id, metric_name, db=db, include_unreviewed=include_unreviewed)
    except ProjectNotFound as exc:
        raise api_error(status.HTTP_404_NOT_FOUND, "PROJECT_NOT_FOUND", "Project was not found.") from exc
    except MetricUnitConflict as exc:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "METRIC_UNIT_CONFLICT",
            "This metric has inconsistent units across submissions and cannot be safely charted.",
        ) from exc

    return {
        "metric_name": metric_name,
        "points": [_serialize_point(point) for point in points],
    }

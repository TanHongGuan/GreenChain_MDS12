from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from backend.app.auth.dependencies import get_current_user
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

router = APIRouter(prefix="/projects", tags=["projects"])


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
    _: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
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

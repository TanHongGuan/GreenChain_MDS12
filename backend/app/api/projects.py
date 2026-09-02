from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.app.auth.dependencies import get_current_user
from backend.app.auth.models import AuthUser
from backend.app.core.database import get_db
from backend.app.core.errors import api_error
from backend.app.models.project import Project
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
    _: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    stmt = select(Project).options(selectinload(Project.organisation)).order_by(Project.name.asc())
    projects = db.scalars(stmt).unique().all()
    return {
        "projects": [
            {
                "project_id": project.id,
                "project_name": project.name,
                "organisation": project.organisation.name,
            }
            for project in projects
        ]
    }


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

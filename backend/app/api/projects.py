from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.app.auth.dependencies import get_current_user
from backend.app.auth.models import AuthUser
from backend.app.core.database import get_db
from backend.app.core.errors import api_error
from backend.app.models.project import Project
from backend.app.models.submission import (
    SUBMISSION_STATUS_APPROVED,
    SUBMISSION_STATUS_UNREVIEWED,
    Submission,
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


def _serialize_point(pair) -> dict | None:
    if pair is None:
        return None
    submission, metric = pair
    return {
        "submission_id": submission.id,
        "reporting_period": submission.reporting_period,
        "value": metric.value,
        "unit": metric.unit,
        "category": metric.category,
        "status": submission.status,
    }


@router.get("/{project_id}")
def project_detail(
    project_id: int,
    _: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    project = db.get(Project, project_id, options=[selectinload(Project.organisation)])
    if project is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "PROJECT_NOT_FOUND", "Project was not found.")

    stmt = (
        select(Submission)
        .where(Submission.project_id == project_id, Submission.status == SUBMISSION_STATUS_APPROVED)
        .options(selectinload(Submission.metrics))
        .order_by(Submission.created_at.desc())
    )
    submissions = db.scalars(stmt).unique().all()

    latest_by_metric: dict[str, tuple] = {}
    previous_by_metric: dict[str, tuple] = {}
    for submission in submissions:
        for metric in submission.metrics:
            if metric.metric_name not in latest_by_metric:
                latest_by_metric[metric.metric_name] = (submission, metric)
            elif metric.metric_name not in previous_by_metric:
                previous_by_metric[metric.metric_name] = (submission, metric)

    metrics_payload = [
        {
            "metric_name": metric_name,
            "latest": _serialize_point(pair),
            "previous": _serialize_point(previous_by_metric.get(metric_name)),
        }
        for metric_name, pair in latest_by_metric.items()
    ]

    return {
        "project": {
            "project_id": project.id,
            "project_name": project.name,
            "organisation": project.organisation.name,
        },
        "metrics": metrics_payload,
    }


@router.get("/{project_id}/metrics/{metric_name}/history")
def metric_history(
    project_id: int,
    metric_name: str,
    include_unreviewed: bool = False,
    _: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    statuses = [SUBMISSION_STATUS_APPROVED]
    if include_unreviewed:
        statuses.append(SUBMISSION_STATUS_UNREVIEWED)

    stmt = (
        select(Submission)
        .where(Submission.project_id == project_id, Submission.status.in_(statuses))
        .options(selectinload(Submission.metrics))
        .order_by(Submission.created_at.asc())
    )
    submissions = db.scalars(stmt).unique().all()

    points = [
        {
            "submission_id": submission.id,
            "reporting_period": submission.reporting_period,
            "value": metric.value,
            "unit": metric.unit,
            "status": submission.status,
        }
        for submission in submissions
        for metric in submission.metrics
        if metric.metric_name == metric_name
    ]

    return {"metric_name": metric_name, "points": points}

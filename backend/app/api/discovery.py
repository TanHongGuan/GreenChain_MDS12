from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from backend.app.auth.dependencies import get_current_user
from backend.app.auth.models import AuthUser
from backend.app.core.database import get_db
from backend.app.core.errors import api_error
from backend.app.discovery.service import (
    DiscoveryError,
    ProjectCard,
    TrustedMetricSummary,
    add_highlight,
    get_home_discovery,
    list_highlighted_projects,
    remove_highlight,
)

router = APIRouter(tags=["discovery"])


@router.get("/discovery/home")
def home_discovery(
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    discovery = get_home_discovery(db=db, user_id=current_user.id)
    return {
        "recently_updated": [_serialize_project_card(card) for card in discovery.recently_updated],
        "featured": [_serialize_project_card(card) for card in discovery.featured],
        "new_projects": [_serialize_project_card(card) for card in discovery.new_projects],
        "featured_rule": discovery.featured_rule,
    }


@router.get("/highlighted/projects")
def highlighted_projects(
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    return {"projects": [_serialize_project_card(card) for card in list_highlighted_projects(db=db, user_id=current_user.id)]}


@router.post("/highlighted/projects/{project_id}")
def highlight_project(
    project_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    try:
        card = add_highlight(db=db, user_id=current_user.id, project_id=project_id)
    except DiscoveryError as exc:
        status_code = status.HTTP_404_NOT_FOUND if exc.code == "PROJECT_NOT_FOUND" else status.HTTP_400_BAD_REQUEST
        raise api_error(status_code, exc.code, exc.message) from exc
    return {"project": _serialize_project_card(card)}


@router.delete("/highlighted/projects/{project_id}")
def unhighlight_project(
    project_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    removed = remove_highlight(db=db, user_id=current_user.id, project_id=project_id)
    return {"project_id": project_id, "highlighted": False, "removed": removed}


def _serialize_project_card(card: ProjectCard) -> dict:
    return {
        "project_id": card.project_id,
        "project_name": card.project_name,
        "organisation": card.organisation,
        "location": card.location,
        "status": card.status,
        "latest_reporting_period": card.latest_reporting_period,
        "updated_at": card.updated_at.isoformat() if card.updated_at else None,
        "created_at": card.created_at.isoformat(),
        "highlighted": card.highlighted,
        "trusted_metric": _serialize_trusted_metric(card.trusted_metric),
    }


def _serialize_trusted_metric(metric: TrustedMetricSummary | None) -> dict | None:
    if metric is None:
        return None
    return {
        "metric_name": metric.metric_name,
        "value": metric.value,
        "unit": metric.unit,
        "category": metric.category,
        "reporting_period": metric.reporting_period,
        "submission_id": metric.submission_id,
    }

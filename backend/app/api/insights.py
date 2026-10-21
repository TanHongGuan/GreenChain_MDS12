from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from backend.app.auth.dependencies import get_current_user
from backend.app.auth.models import AuthUser
from backend.app.insights.consistency import (
    ConsistencyCell,
    ConsistencyReport,
    get_consistency_report,
)
from backend.app.insights.errors import ProjectNotFound
from backend.app.core.database import get_db
from backend.app.core.errors import api_error

router = APIRouter(prefix="/insights", tags=["insights"])


def _serialize_cell(cell: ConsistencyCell) -> dict:
    return {
        "metric_name": cell.metric_name,
        "reporting_period": cell.reporting_period,
        "state": cell.state,
        "value": cell.value,
        "unit": cell.unit,
        "submission_id": cell.submission_id,
    }


def _serialize_consistency(report: ConsistencyReport) -> dict:
    return {
        "project_id": report.project_id,
        "metrics": report.metrics,
        "periods": report.periods,
        "cells": [_serialize_cell(cell) for cell in report.cells],
        "approved_cells": report.approved_cells,
        "total_cells": report.total_cells,
        "approved_coverage_percent": report.approved_coverage_percent,
    }


@router.get("/projects/{project_id}/consistency")
def project_consistency(
    project_id: int,
    _: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    try:
        report = get_consistency_report(project_id, db=db)
    except ProjectNotFound as exc:
        raise api_error(status.HTTP_404_NOT_FOUND, "PROJECT_NOT_FOUND", "Project was not found.") from exc
    return _serialize_consistency(report)

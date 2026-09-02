from urllib.parse import quote

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.auth.dependencies import require_roles
from backend.app.auth.models import AuthUser, UserRole
from backend.app.core.database import get_db
from backend.app.core.errors import api_error
from backend.app.reviews.errors import (
    EvidenceNotFound,
    InvalidReviewTransition,
    ReviewPersistenceFailure,
    SubmissionNotFound,
)
from backend.app.reviews.service import (
    VALID_DECISIONS,
    PendingSubmissionSummary,
    ReviewDetail,
    decide_submission,
    get_original_evidence,
    get_processed_evidence,
    get_review_detail,
    list_pending_reviews,
    verify_original_integrity,
)
from backend.app.storage.base import StorageService
from backend.app.storage.dependencies import get_storage_service

router = APIRouter(prefix="/reviews", tags=["reviews"])


class ReviewDecisionRequest(BaseModel):
    decision: str
    reason: str | None = None


def _serialize_uploader(summary) -> dict:
    return {"id": summary.id, "name": summary.name, "email": summary.email}


def _serialize_pending(summary: PendingSubmissionSummary) -> dict:
    return {
        "submission_id": summary.submission_id,
        "project_name": summary.project_name,
        "organisation": summary.organisation_name,
        "reporting_period": summary.reporting_period,
        "submitted_by": _serialize_uploader(summary.submitted_by),
        "submitted_at": summary.created_at.isoformat() if summary.created_at else None,
        "status": summary.status,
    }


def _serialize_detail(detail: ReviewDetail, integrity: dict) -> dict:
    return {
        "submission_id": detail.submission_id,
        "project_name": detail.project_name,
        "organisation": detail.organisation_name,
        "reporting_period": detail.reporting_period,
        "submitted_by": _serialize_uploader(detail.submitted_by),
        "submitted_at": detail.created_at.isoformat() if detail.created_at else None,
        "status": detail.status,
        "original_sha256": detail.original_sha256,
        "metrics": [
            {
                "metric_name": metric.metric_name,
                "value": metric.value,
                "unit": metric.unit,
                "category": metric.category,
            }
            for metric in detail.metrics
        ],
        "evidence": {
            "original": {
                "label": detail.original_filename,
                "url": f"/reviews/submissions/{detail.submission_id}/evidence/original",
            },
            "processed": {
                "label": f"processed-{detail.submission_id}-{detail.original_filename}",
                "url": f"/reviews/submissions/{detail.submission_id}/evidence/processed",
            },
        },
        "integrity": integrity,
    }


def _integrity_payload(submission_id: int, db: Session, storage: StorageService) -> dict:
    try:
        result = verify_original_integrity(submission_id, db=db, storage=storage)
    except EvidenceNotFound:
        return {"status": "UNAVAILABLE", "message": "Original evidence is not available."}
    return {
        "status": "MATCH" if result.matches else "MISMATCH",
        "sha256": result.expected_hash,
    }


@router.get("/submissions/pending")
def pending_submissions(
    _: AuthUser = Depends(require_roles(UserRole.AUDITOR)),
    db: Session = Depends(get_db),
) -> dict:
    summaries = list_pending_reviews(db=db)
    return {"submissions": [_serialize_pending(summary) for summary in summaries]}


@router.get("/submissions/{submission_id}")
def review_detail(
    submission_id: int,
    _: AuthUser = Depends(require_roles(UserRole.AUDITOR)),
    db: Session = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
) -> dict:
    try:
        detail = get_review_detail(submission_id, db=db)
    except SubmissionNotFound as exc:
        raise api_error(status.HTTP_404_NOT_FOUND, "SUBMISSION_NOT_FOUND", "Submission was not found.") from exc

    integrity = _integrity_payload(submission_id, db, storage)
    return {"submission": _serialize_detail(detail, integrity)}


@router.post("/submissions/{submission_id}/decision")
def review_decision(
    submission_id: int,
    payload: ReviewDecisionRequest,
    current_user: AuthUser = Depends(require_roles(UserRole.AUDITOR)),
    db: Session = Depends(get_db),
) -> dict:
    clean_decision = (payload.decision or "").strip().upper()
    if clean_decision not in VALID_DECISIONS:
        raise api_error(status.HTTP_400_BAD_REQUEST, "INVALID_DECISION", "Decision must be APPROVED or REJECTED.")
    clean_reason = payload.reason.strip() if payload.reason else None

    try:
        result = decide_submission(submission_id, clean_decision, clean_reason, current_user.id, db=db)
    except SubmissionNotFound as exc:
        raise api_error(status.HTTP_404_NOT_FOUND, "SUBMISSION_NOT_FOUND", "Submission was not found.") from exc
    except InvalidReviewTransition as exc:
        raise api_error(
            status.HTTP_409_CONFLICT, "INVALID_REVIEW_STATE", "Only UNREVIEWED submissions can be reviewed."
        ) from exc
    except ReviewPersistenceFailure as exc:
        raise api_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "REVIEW_DECISION_FAILED",
            "Review decision could not be saved. Please try again.",
        ) from exc
    except Exception as exc:
        raise api_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "REVIEW_DECISION_FAILED",
            "Review decision could not be saved. Please try again.",
        ) from exc

    return {
        "submission_id": result.submission_id,
        "status": result.status,
        "reason": clean_reason,
        "message": f"Submission {result.status.lower()} successfully.",
    }


@router.get("/submissions/{submission_id}/evidence/{kind}")
def review_evidence(
    submission_id: int,
    kind: str,
    _: AuthUser = Depends(require_roles(UserRole.AUDITOR)),
    db: Session = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
) -> Response:
    clean_kind = kind.strip().lower()
    if clean_kind not in {"original", "processed"}:
        raise api_error(
            status.HTTP_400_BAD_REQUEST, "INVALID_EVIDENCE_TYPE", "Evidence type must be original or processed."
        )

    try:
        if clean_kind == "original":
            evidence = get_original_evidence(submission_id, db=db, storage=storage)
            content_type = "application/octet-stream"
        else:
            evidence = get_processed_evidence(submission_id, db=db, storage=storage)
            content_type = "text/csv"
    except SubmissionNotFound as exc:
        raise api_error(status.HTTP_404_NOT_FOUND, "SUBMISSION_NOT_FOUND", "Submission was not found.") from exc
    except EvidenceNotFound as exc:
        raise api_error(status.HTTP_404_NOT_FOUND, "EVIDENCE_NOT_FOUND", "Evidence file is not available.") from exc
    except Exception as exc:
        raise api_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "EVIDENCE_RETRIEVAL_FAILED",
            "Evidence file could not be retrieved. Please try again.",
        ) from exc

    safe_filename = quote(evidence.filename)
    return Response(
        content=evidence.content,
        media_type=content_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe_filename}"},
    )

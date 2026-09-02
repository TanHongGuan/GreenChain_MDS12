from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.auth.dependencies import require_roles
from backend.app.auth.models import AuthUser, UserRole
from backend.app.core.database import get_db
from backend.app.core.errors import api_error
from backend.app.reviews.service import (
    ReviewEvidenceError,
    ReviewNotFoundError,
    ReviewStateError,
    ReviewValidationError,
    decide_submission,
    get_evidence_file,
    get_submission_detail,
    list_pending_submissions,
)
from backend.app.storage.base import StorageService
from backend.app.storage.dependencies import get_storage_service

router = APIRouter(prefix="/reviews", tags=["reviews"])


class ReviewDecisionRequest(BaseModel):
    decision: str
    reason: str | None = None


@router.get("/submissions/pending")
def pending_submissions(
    _: AuthUser = Depends(require_roles(UserRole.AUDITOR)),
    db: Session = Depends(get_db),
) -> dict:
    return {"submissions": list_pending_submissions(db)}


@router.get("/submissions/{submission_id}")
def review_detail(
    submission_id: int,
    _: AuthUser = Depends(require_roles(UserRole.AUDITOR)),
    db: Session = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
) -> dict:
    try:
        return {"submission": get_submission_detail(db, storage, submission_id)}
    except ReviewNotFoundError as exc:
        raise api_error(status.HTTP_404_NOT_FOUND, "SUBMISSION_NOT_FOUND", "Submission was not found.") from exc


@router.post("/submissions/{submission_id}/decision")
def review_decision(
    submission_id: int,
    payload: ReviewDecisionRequest,
    _: AuthUser = Depends(require_roles(UserRole.AUDITOR)),
    db: Session = Depends(get_db),
) -> dict:
    try:
        return decide_submission(db, submission_id, payload.decision, payload.reason)
    except ReviewValidationError as exc:
        raise api_error(status.HTTP_400_BAD_REQUEST, "INVALID_DECISION", str(exc)) from exc
    except ReviewNotFoundError as exc:
        raise api_error(status.HTTP_404_NOT_FOUND, "SUBMISSION_NOT_FOUND", "Submission was not found.") from exc
    except ReviewStateError as exc:
        raise api_error(status.HTTP_409_CONFLICT, "INVALID_REVIEW_STATE", str(exc)) from exc
    except Exception as exc:
        raise api_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "REVIEW_DECISION_FAILED",
            "Review decision could not be saved. Please try again.",
        ) from exc


@router.get("/submissions/{submission_id}/evidence/{kind}")
def review_evidence(
    submission_id: int,
    kind: str,
    _: AuthUser = Depends(require_roles(UserRole.AUDITOR)),
    db: Session = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
) -> Response:
    try:
        evidence = get_evidence_file(db, storage, submission_id, kind)
    except ReviewValidationError as exc:
        raise api_error(status.HTTP_400_BAD_REQUEST, "INVALID_EVIDENCE_TYPE", str(exc)) from exc
    except ReviewNotFoundError as exc:
        raise api_error(status.HTTP_404_NOT_FOUND, "SUBMISSION_NOT_FOUND", "Submission was not found.") from exc
    except ReviewEvidenceError as exc:
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
        media_type=evidence.content_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe_filename}"},
    )

from dataclasses import dataclass
from io import BytesIO
from pathlib import PurePosixPath

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.app.integrity.hashing import calculate_sha256
from backend.app.models.metric import Metric
from backend.app.models.project import Project
from backend.app.models.submission import (
    SUBMISSION_STATUS_APPROVED,
    SUBMISSION_STATUS_REJECTED,
    SUBMISSION_STATUS_UNREVIEWED,
    Submission,
)
from backend.app.storage.base import StorageService
from backend.app.storage.exceptions import StorageError

VALID_REVIEW_DECISIONS = {SUBMISSION_STATUS_APPROVED, SUBMISSION_STATUS_REJECTED}


class ReviewNotFoundError(Exception):
    """Raised when a submission cannot be found for review."""


class ReviewStateError(Exception):
    """Raised when a submission can no longer be reviewed."""


class ReviewValidationError(Exception):
    """Raised when a review request is malformed."""


class ReviewEvidenceError(Exception):
    """Raised when authorised evidence cannot be retrieved."""


@dataclass(frozen=True)
class EvidenceFile:
    content: bytes
    filename: str
    content_type: str


def list_pending_submissions(db: Session) -> list[dict]:
    stmt = (
        select(Submission)
        .where(Submission.status == SUBMISSION_STATUS_UNREVIEWED)
        .options(
            selectinload(Submission.project).selectinload(Project.organisation),
            selectinload(Submission.uploader),
        )
        .order_by(Submission.created_at.desc(), Submission.id.desc())
    )
    return [_summary(submission) for submission in db.scalars(stmt).all()]


def get_submission_detail(db: Session, storage: StorageService, submission_id: int) -> dict:
    submission = _get_submission(db, submission_id)
    return {
        **_summary(submission),
        "original_sha256": submission.original_sha256,
        "metrics": [_metric(metric) for metric in sorted(submission.metrics, key=lambda item: item.metric_name)],
        "evidence": {
            "original": {
                "label": submission.original_filename,
                "url": f"/reviews/submissions/{submission.id}/evidence/original",
            },
            "processed": {
                "label": PurePosixPath(submission.processed_storage_key).name,
                "url": f"/reviews/submissions/{submission.id}/evidence/processed",
            },
        },
        "integrity": _integrity_result(storage, submission),
    }


def decide_submission(db: Session, submission_id: int, decision: str, reason: str | None = None) -> dict:
    clean_decision = decision.strip().upper()
    clean_reason = reason.strip() if reason else None

    if clean_decision not in VALID_REVIEW_DECISIONS:
        raise ReviewValidationError("Decision must be APPROVED or REJECTED.")

    submission = _get_submission(db, submission_id)
    if submission.status != SUBMISSION_STATUS_UNREVIEWED:
        raise ReviewStateError("Only UNREVIEWED submissions can be reviewed.")

    try:
        submission.status = clean_decision
        db.commit()
        db.refresh(submission)
    except Exception:
        db.rollback()
        raise

    return {
        "submission_id": submission.id,
        "status": submission.status,
        "reason": clean_reason,
        "message": f"Submission {submission.status.lower()} successfully.",
    }


def get_evidence_file(db: Session, storage: StorageService, submission_id: int, kind: str) -> EvidenceFile:
    submission = _get_submission(db, submission_id)
    clean_kind = kind.strip().lower()

    if clean_kind == "original":
        storage_key = submission.original_storage_key
        filename = submission.original_filename
        content_type = "application/octet-stream"
    elif clean_kind == "processed":
        storage_key = submission.processed_storage_key
        filename = PurePosixPath(submission.processed_storage_key).name or "processed.csv"
        content_type = "text/csv"
    else:
        raise ReviewValidationError("Evidence type must be original or processed.")

    try:
        return EvidenceFile(content=storage.retrieve(storage_key), filename=filename, content_type=content_type)
    except StorageError as exc:
        raise ReviewEvidenceError("Evidence file is not available.") from exc


def _get_submission(db: Session, submission_id: int) -> Submission:
    stmt = (
        select(Submission)
        .where(Submission.id == submission_id)
        .options(
            selectinload(Submission.project).selectinload(Project.organisation),
            selectinload(Submission.uploader),
            selectinload(Submission.metrics),
        )
    )
    submission = db.scalars(stmt).first()
    if submission is None:
        raise ReviewNotFoundError("Submission was not found.")
    return submission


def _summary(submission: Submission) -> dict:
    return {
        "submission_id": submission.id,
        "project_name": submission.project.name,
        "organisation": submission.project.organisation.name,
        "reporting_period": submission.reporting_period,
        "submitted_by": {
            "id": submission.uploader.id,
            "name": submission.uploader.name,
            "email": submission.uploader.email,
        },
        "submitted_at": submission.created_at.isoformat() if submission.created_at else None,
        "status": submission.status,
    }


def _metric(metric: Metric) -> dict:
    return {
        "metric_name": metric.metric_name,
        "value": metric.value,
        "unit": metric.unit,
        "category": metric.category,
    }


def _integrity_result(storage: StorageService, submission: Submission) -> dict:
    try:
        original_bytes = storage.retrieve(submission.original_storage_key)
    except StorageError:
        return {"status": "UNAVAILABLE", "message": "Original evidence is not available."}

    actual_sha256 = calculate_sha256(BytesIO(original_bytes))
    if actual_sha256 == submission.original_sha256:
        return {"status": "MATCH", "sha256": submission.original_sha256}
    return {"status": "MISMATCH", "sha256": submission.original_sha256}

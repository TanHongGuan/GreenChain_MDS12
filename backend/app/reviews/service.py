from dataclasses import dataclass
from datetime import datetime
from io import BytesIO

from sqlalchemy.orm import Session

from backend.app.integrity.hashing import calculate_sha256
from backend.app.models.review import Review
from backend.app.models.submission import (
    SUBMISSION_STATUS_APPROVED,
    SUBMISSION_STATUS_REJECTED,
    Submission,
)
from backend.app.repositories.metrics import get_metrics_for_submission
from backend.app.repositories.reviews import create_review, get_review_for_submission
from backend.app.repositories.submissions import (
    get_submission_by_id,
    list_unreviewed_submissions,
    update_submission_status_if_unreviewed,
)
from backend.app.reviews.errors import (
    EvidenceIntegrityMismatch,
    EvidenceNotFound,
    InvalidReviewTransition,
    ReviewPersistenceFailure,
    SubmissionNotFound,
)
from backend.app.storage.base import StorageService
from backend.app.storage.exceptions import StorageError

VALID_DECISIONS = {SUBMISSION_STATUS_APPROVED, SUBMISSION_STATUS_REJECTED}


@dataclass(frozen=True)
class MetricSummary:
    metric_name: str
    value: float
    unit: str
    category: str | None


@dataclass(frozen=True)
class ReviewSummary:
    review_id: int
    reviewer_id: str
    decision: str
    reason: str | None
    reviewed_at: datetime


@dataclass(frozen=True)
class PendingSubmissionSummary:
    submission_id: int
    project_name: str
    organisation_name: str
    reporting_period: str
    submitted_by: str
    created_at: datetime
    status: str


@dataclass(frozen=True)
class ReviewDetail:
    submission_id: int
    project_name: str
    organisation_name: str
    reporting_period: str
    submitted_by: str
    created_at: datetime
    status: str
    metrics: list[MetricSummary]
    original_filename: str
    original_sha256: str
    existing_review: ReviewSummary | None


@dataclass(frozen=True)
class EvidenceFile:
    filename: str
    content: bytes


@dataclass(frozen=True)
class IntegrityResult:
    expected_hash: str
    actual_hash: str
    matches: bool


@dataclass(frozen=True)
class DecisionResult:
    submission_id: int
    review_id: int
    status: str


def _require_submission(db: Session, submission_id: int) -> Submission:
    submission = get_submission_by_id(db, submission_id)
    if submission is None:
        raise SubmissionNotFound(f"Submission {submission_id} was not found.")
    return submission


def _to_pending_summary(submission: Submission) -> PendingSubmissionSummary:
    return PendingSubmissionSummary(
        submission_id=submission.id,
        project_name=submission.project.name,
        organisation_name=submission.project.organisation.name,
        reporting_period=submission.reporting_period,
        submitted_by=submission.uploader.name,
        created_at=submission.created_at,
        status=submission.status,
    )


def _to_review_summary(review: Review) -> ReviewSummary:
    return ReviewSummary(
        review_id=review.id,
        reviewer_id=review.reviewer_id,
        decision=review.decision,
        reason=review.reason,
        reviewed_at=review.reviewed_at,
    )


def list_pending_reviews(*, db: Session) -> list[PendingSubmissionSummary]:
    submissions = list_unreviewed_submissions(db)
    return [_to_pending_summary(submission) for submission in submissions]


def get_review_detail(submission_id: int, *, db: Session) -> ReviewDetail:
    submission = _require_submission(db, submission_id)
    metrics = get_metrics_for_submission(db, submission_id)
    review = get_review_for_submission(db, submission_id)

    return ReviewDetail(
        submission_id=submission.id,
        project_name=submission.project.name,
        organisation_name=submission.project.organisation.name,
        reporting_period=submission.reporting_period,
        submitted_by=submission.uploader.name,
        created_at=submission.created_at,
        status=submission.status,
        metrics=[
            MetricSummary(metric_name=metric.metric_name, value=metric.value, unit=metric.unit, category=metric.category)
            for metric in metrics
        ],
        original_filename=submission.original_filename,
        original_sha256=submission.original_sha256,
        existing_review=_to_review_summary(review) if review is not None else None,
    )


def decide_submission(
    submission_id: int,
    decision: str,
    reason: str | None,
    reviewer_id: str,
    *,
    db: Session,
) -> DecisionResult:
    if decision not in VALID_DECISIONS:
        raise InvalidReviewTransition(f"'{decision}' is not a valid review decision.")

    submission = _require_submission(db, submission_id)

    try:
        updated = update_submission_status_if_unreviewed(db, submission.id, decision)
        if not updated:
            raise InvalidReviewTransition(f"Submission {submission_id} is not awaiting review.")
        review = create_review(
            db,
            submission_id=submission.id,
            reviewer_id=reviewer_id,
            decision=decision,
            reason=reason,
        )
        db.commit()
    except InvalidReviewTransition:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise ReviewPersistenceFailure("Review decision could not be saved.") from exc

    return DecisionResult(submission_id=submission.id, review_id=review.id, status=decision)


def _retrieve_evidence(storage: StorageService, storage_key: str, filename: str) -> EvidenceFile:
    try:
        content = storage.retrieve(storage_key)
    except StorageError as exc:
        raise EvidenceNotFound("Evidence file was not found.") from exc
    return EvidenceFile(filename=filename, content=content)


def get_original_evidence(submission_id: int, *, db: Session, storage: StorageService) -> EvidenceFile:
    submission = _require_submission(db, submission_id)
    return _retrieve_evidence(storage, submission.original_storage_key, submission.original_filename)


def get_processed_evidence(submission_id: int, *, db: Session, storage: StorageService) -> EvidenceFile:
    submission = _require_submission(db, submission_id)
    filename = f"processed-{submission.id}-{submission.original_filename}"
    return _retrieve_evidence(storage, submission.processed_storage_key, filename)


def verify_original_integrity(submission_id: int, *, db: Session, storage: StorageService) -> IntegrityResult:
    submission = _require_submission(db, submission_id)
    try:
        content = storage.retrieve(submission.original_storage_key)
    except StorageError as exc:
        raise EvidenceNotFound("Original evidence file was not found.") from exc

    actual_hash = calculate_sha256(BytesIO(content))
    return IntegrityResult(
        expected_hash=submission.original_sha256,
        actual_hash=actual_hash,
        matches=actual_hash == submission.original_sha256,
    )


def ensure_integrity(result: IntegrityResult) -> IntegrityResult:
    """Raise for callers that require a hard failure on a SHA-256 mismatch."""
    if not result.matches:
        raise EvidenceIntegrityMismatch("Stored original evidence failed SHA-256 verification.")
    return result

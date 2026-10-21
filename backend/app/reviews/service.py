from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.integrity.verification import IntegrityStatus, verify_stored_evidence
from backend.app.models.review import Review
from backend.app.models.submission_auditor import SubmissionAuditor
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
    ReviewNotAssigned,
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
class UploaderSummary:
    id: str
    name: str
    email: str


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
    submitted_by: UploaderSummary
    created_at: datetime
    status: str


@dataclass(frozen=True)
class ReviewDetail:
    submission_id: int
    project_name: str
    organisation_name: str
    reporting_period: str
    submitted_by: UploaderSummary
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
    status: str | None = None
    storage_hash: str | None = None
    trusted_reference: str | None = None
    version_id: str | None = None
    reason: str | None = None


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


def _to_uploader_summary(submission: Submission) -> UploaderSummary:
    return UploaderSummary(
        id=submission.uploader.id,
        name=submission.uploader.name,
        email=submission.uploader.email,
    )


def _to_pending_summary(submission: Submission) -> PendingSubmissionSummary:
    return PendingSubmissionSummary(
        submission_id=submission.id,
        project_name=submission.project.name,
        organisation_name=submission.project.organisation.name,
        reporting_period=submission.reporting_period,
        submitted_by=_to_uploader_summary(submission),
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


def _assigned_auditor_ids(db: Session, submission_id: int) -> set[str]:
    return set(db.scalars(
        select(SubmissionAuditor.auditor_id).where(SubmissionAuditor.submission_id == submission_id)
    ).all())


def _require_assignment(db: Session, submission: Submission, auditor_id: str | None) -> None:
    """Refuse unless this auditor is one of those the company appointed.

    A submission nobody has been appointed to is reviewable by nobody. That is
    deliberate: the alternative is any auditor approving evidence the owner never
    asked them to look at.
    """
    if auditor_id is None:
        return
    assigned = _assigned_auditor_ids(db, submission.id)
    if not assigned:
        raise ReviewNotAssigned(
            f"Submission {submission.id} has no auditor assigned to it. The company that owns it "
            f"has to assign one before it can be reviewed."
        )
    if auditor_id not in assigned:
        raise ReviewNotAssigned(
            f"Submission {submission.id} is assigned to other auditors."
        )


def list_pending_reviews(*, db: Session, auditor_id: str | None = None) -> list[PendingSubmissionSummary]:
    """Submissions awaiting review, narrowed to the ones this auditor was given.

    `auditor_id=None` means "do not narrow" and exists for callers that are not
    acting as a particular auditor.
    """
    submissions = list_unreviewed_submissions(db)
    if auditor_id is not None:
        mine = set(db.scalars(
            select(SubmissionAuditor.submission_id).where(SubmissionAuditor.auditor_id == auditor_id)
        ).all())
        submissions = [item for item in submissions if item.id in mine]
    return [_to_pending_summary(submission) for submission in submissions]


@dataclass(frozen=True)
class DecisionSummary:
    submission_id: int
    project_name: str
    organisation_name: str
    reporting_period: str
    decision: str
    reason: str | None
    reviewed_at: datetime


def list_decisions_by(auditor_id: str, *, db: Session) -> list[DecisionSummary]:
    """Every decision this auditor has recorded, newest first.

    Only their own reviews: the history of who approved what on other people's
    assignments is not theirs to browse from here.
    """
    reviews = db.scalars(
        select(Review).where(Review.reviewer_id == auditor_id).order_by(Review.reviewed_at.desc(), Review.id.desc())
    ).all()
    return [
        DecisionSummary(
            submission_id=review.submission.id,
            project_name=review.submission.project.name,
            organisation_name=review.submission.project.organisation.name,
            reporting_period=review.submission.reporting_period,
            decision=review.decision,
            reason=review.reason,
            reviewed_at=review.reviewed_at,
        )
        for review in reviews
    ]


def get_review_detail(submission_id: int, *, db: Session, auditor_id: str | None = None) -> ReviewDetail:
    submission = _require_submission(db, submission_id)
    _require_assignment(db, submission, auditor_id)
    metrics = get_metrics_for_submission(db, submission_id)
    review = get_review_for_submission(db, submission_id)

    return ReviewDetail(
        submission_id=submission.id,
        project_name=submission.project.name,
        organisation_name=submission.project.organisation.name,
        reporting_period=submission.reporting_period,
        submitted_by=_to_uploader_summary(submission),
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
    # Checked here rather than only at the API edge, so the rule holds for any
    # caller of this function.
    _require_assignment(db, submission, reviewer_id)

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


def _retrieve_evidence(
    storage: StorageService, storage_key: str, version_id: str | None, filename: str
) -> EvidenceFile:
    # Auditors may download evidence that fails verification so they can inspect it; the review
    # detail payload reports the integrity status alongside.
    try:
        content = storage.retrieve(storage_key, version_id)
    except StorageError as exc:
        raise EvidenceNotFound("Evidence file was not found.") from exc
    return EvidenceFile(filename=filename, content=content)


def get_original_evidence(submission_id: int, *, db: Session, storage: StorageService) -> EvidenceFile:
    submission = _require_submission(db, submission_id)
    return _retrieve_evidence(
        storage, submission.original_storage_key, submission.original_version_id, submission.original_filename
    )


def get_processed_evidence(submission_id: int, *, db: Session, storage: StorageService) -> EvidenceFile:
    submission = _require_submission(db, submission_id)
    filename = f"processed-{submission.id}-{submission.original_filename}"
    return _retrieve_evidence(storage, submission.processed_storage_key, submission.processed_version_id, filename)


def verify_original_integrity(submission_id: int, *, db: Session, storage: StorageService) -> IntegrityResult:
    submission = _require_submission(db, submission_id)
    check = verify_stored_evidence(
        storage, submission.original_storage_key, submission.original_version_id, submission.original_sha256
    )
    if check.status == IntegrityStatus.UNAVAILABLE:
        raise EvidenceNotFound("Original evidence file was not found.")

    return IntegrityResult(
        expected_hash=submission.original_sha256,
        actual_hash=check.actual_sha256 or "",
        matches=check.status == IntegrityStatus.MATCH,
        status=check.status.value,
        storage_hash=check.storage_sha256,
        trusted_reference=check.trusted_reference.value if check.trusted_reference else None,
        version_id=check.version_id,
        reason=check.reason,
    )


def ensure_integrity(result: IntegrityResult) -> IntegrityResult:
    """Raise for callers that require a hard failure on a SHA-256 mismatch."""
    if not result.matches:
        raise EvidenceIntegrityMismatch("Stored original evidence failed SHA-256 verification.")
    return result

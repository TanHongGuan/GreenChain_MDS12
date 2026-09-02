from dataclasses import dataclass
from datetime import datetime
from io import BytesIO

from sqlalchemy.orm import Session

from backend.app.auth.models import AuthUser
from backend.app.integrity.hashing import calculate_sha256
from backend.app.models.review import Review
from backend.app.models.submission import Submission
from backend.app.repositories.projects import get_project_by_id
from backend.app.repositories.reviews import get_review_for_submission
from backend.app.repositories.submissions import get_submission_trace_by_id, list_submission_history_for_project
from backend.app.storage.base import StorageService
from backend.app.storage.exceptions import InvalidStorageKey, StorageError
from backend.app.submissions.errors import (
    EvidenceIntegrityMismatch,
    EvidenceNotFound,
    InvalidArtifactType,
    ProjectNotFound,
    SubmissionNotFound,
)

ARTIFACT_ORIGINAL = "original"
ARTIFACT_PROCESSED = "processed"
ARTIFACT_AUDIT_REPORT = "audit_report"
VALID_ARTIFACT_TYPES = {ARTIFACT_ORIGINAL, ARTIFACT_PROCESSED, ARTIFACT_AUDIT_REPORT}


@dataclass(frozen=True)
class UploaderSummary:
    id: str
    name: str
    email: str


@dataclass(frozen=True)
class ReviewSummary:
    review_id: int
    reviewer_id: str
    decision: str
    reason: str | None
    reviewed_at: datetime


@dataclass(frozen=True)
class MetricTrace:
    metric_name: str
    value: float
    unit: str
    category: str | None
    submission_id: int
    reporting_period: str
    status: str


@dataclass(frozen=True)
class IntegrityResult:
    expected_hash: str
    actual_hash: str | None
    matches: bool | None


@dataclass(frozen=True)
class EvidenceMetadata:
    artifact_type: str
    available: bool
    filename: str | None
    content_type: str | None
    size_bytes: int | None
    storage_backend: str
    sha256: str | None
    integrity: IntegrityResult | None


@dataclass(frozen=True)
class VersionLink:
    submission_id: int
    reporting_period: str
    status: str
    submitted_at: datetime


@dataclass(frozen=True)
class SubmissionRecord:
    submission_id: int
    project_id: int
    project_name: str
    organisation_name: str
    reporting_period: str
    status: str
    submitted_by: UploaderSummary
    submitted_at: datetime
    review: ReviewSummary | None
    evidence: dict[str, EvidenceMetadata]
    previous_submission: VersionLink | None
    corrected_by: list[VersionLink]


@dataclass(frozen=True)
class SubmissionDetail(SubmissionRecord):
    metrics: list[MetricTrace]


@dataclass(frozen=True)
class EvidenceFile:
    filename: str
    content: bytes
    content_type: str


def _touch_authorization(current_user: AuthUser) -> None:
    if not current_user.is_active:
        raise SubmissionNotFound("Submission was not found.")


def _require_project(db: Session, project_id: int) -> None:
    if get_project_by_id(db, project_id) is None:
        raise ProjectNotFound(f"Project {project_id} was not found.")


def _require_submission(db: Session, submission_id: int) -> Submission:
    submission = get_submission_trace_by_id(db, submission_id)
    if submission is None:
        raise SubmissionNotFound(f"Submission {submission_id} was not found.")
    return submission


def _version_link(submission: Submission | None) -> VersionLink | None:
    if submission is None:
        return None
    return VersionLink(
        submission_id=submission.id,
        reporting_period=submission.reporting_period,
        status=submission.status,
        submitted_at=submission.created_at,
    )


def _review_summary(review: Review | None) -> ReviewSummary | None:
    if review is None:
        return None
    return ReviewSummary(
        review_id=review.id,
        reviewer_id=review.reviewer_id,
        decision=review.decision,
        reason=review.reason,
        reviewed_at=review.reviewed_at,
    )


def _uploader_summary(submission: Submission) -> UploaderSummary:
    return UploaderSummary(
        id=submission.uploader.id,
        name=submission.uploader.name,
        email=submission.uploader.email,
    )


def _safe_exists(storage: StorageService, storage_key: str) -> bool:
    try:
        return storage.exists(storage_key)
    except (InvalidStorageKey, StorageError):
        return False


def _metadata_from_storage(
    storage: StorageService,
    *,
    artifact_type: str,
    storage_key: str,
    filename: str,
    content_type: str,
    sha256: str | None = None,
    verify_integrity: bool = False,
) -> EvidenceMetadata:
    if not _safe_exists(storage, storage_key):
        return EvidenceMetadata(
            artifact_type=artifact_type,
            available=False,
            filename=filename,
            content_type=content_type,
            size_bytes=None,
            storage_backend="local",
            sha256=sha256,
            integrity=None,
        )

    try:
        content = storage.retrieve(storage_key)
    except StorageError:
        return EvidenceMetadata(
            artifact_type=artifact_type,
            available=False,
            filename=filename,
            content_type=content_type,
            size_bytes=None,
            storage_backend="local",
            sha256=sha256,
            integrity=None,
        )

    integrity = None
    if verify_integrity and sha256:
        actual_hash = calculate_sha256(BytesIO(content))
        integrity = IntegrityResult(expected_hash=sha256, actual_hash=actual_hash, matches=actual_hash == sha256)

    return EvidenceMetadata(
        artifact_type=artifact_type,
        available=True,
        filename=filename,
        content_type=content_type,
        size_bytes=len(content),
        storage_backend="local",
        sha256=sha256,
        integrity=integrity,
    )


def _audit_report_content(submission: Submission, review: Review) -> bytes:
    reason = review.reason or "No reason provided."
    lines = [
        "GreenChain Audit Report",
        f"Submission ID: {submission.id}",
        f"Project: {submission.project.name}",
        f"Organisation: {submission.project.organisation.name}",
        f"Reporting Period: {submission.reporting_period}",
        f"Decision: {review.decision}",
        f"Reviewer ID: {review.reviewer_id}",
        f"Reviewed At: {review.reviewed_at.isoformat()}",
        f"Reason: {reason}",
        "",
    ]
    return "\n".join(lines).encode("utf-8")


def _evidence_metadata(submission: Submission, db: Session, storage: StorageService) -> dict[str, EvidenceMetadata]:
    review = get_review_for_submission(db, submission.id)
    original = _metadata_from_storage(
        storage,
        artifact_type=ARTIFACT_ORIGINAL,
        storage_key=submission.original_storage_key,
        filename=submission.original_filename,
        content_type="application/octet-stream",
        sha256=submission.original_sha256,
        verify_integrity=True,
    )
    processed = _metadata_from_storage(
        storage,
        artifact_type=ARTIFACT_PROCESSED,
        storage_key=submission.processed_storage_key,
        filename=f"processed-{submission.id}-{submission.original_filename}",
        content_type="text/csv",
    )
    audit_available = review is not None
    audit = EvidenceMetadata(
        artifact_type=ARTIFACT_AUDIT_REPORT,
        available=audit_available,
        filename=f"audit-report-submission-{submission.id}.txt" if audit_available else None,
        content_type="text/plain; charset=utf-8" if audit_available else None,
        size_bytes=len(_audit_report_content(submission, review)) if review is not None else None,
        storage_backend="generated",
        sha256=None,
        integrity=None,
    )
    return {
        ARTIFACT_ORIGINAL: original,
        ARTIFACT_PROCESSED: processed,
        ARTIFACT_AUDIT_REPORT: audit,
    }


def _to_record(submission: Submission, db: Session, storage: StorageService) -> SubmissionRecord:
    review = get_review_for_submission(db, submission.id)
    return SubmissionRecord(
        submission_id=submission.id,
        project_id=submission.project_id,
        project_name=submission.project.name,
        organisation_name=submission.project.organisation.name,
        reporting_period=submission.reporting_period,
        status=submission.status,
        submitted_by=_uploader_summary(submission),
        submitted_at=submission.created_at,
        review=_review_summary(review),
        evidence=_evidence_metadata(submission, db, storage),
        previous_submission=_version_link(submission.previous_submission),
        corrected_by=[link for correction in submission.corrections if (link := _version_link(correction)) is not None],
    )


def get_submission_history(project_id: int, current_user: AuthUser, *, db: Session, storage: StorageService) -> list[SubmissionRecord]:
    _touch_authorization(current_user)
    _require_project(db, project_id)
    return [_to_record(submission, db, storage) for submission in list_submission_history_for_project(db, project_id)]


def get_submission_detail(submission_id: int, current_user: AuthUser, *, db: Session, storage: StorageService) -> SubmissionDetail:
    _touch_authorization(current_user)
    submission = _require_submission(db, submission_id)
    record = _to_record(submission, db, storage)
    metrics = [
        MetricTrace(
            metric_name=metric.metric_name,
            value=metric.value,
            unit=metric.unit,
            category=metric.category,
            submission_id=submission.id,
            reporting_period=submission.reporting_period,
            status=submission.status,
        )
        for metric in submission.metrics
    ]
    return SubmissionDetail(**record.__dict__, metrics=metrics)


def verify_original_integrity(submission_id: int, current_user: AuthUser, *, db: Session, storage: StorageService) -> IntegrityResult:
    _touch_authorization(current_user)
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
    if not result.matches:
        raise EvidenceIntegrityMismatch("Stored original evidence failed SHA-256 verification.")
    return result


def get_evidence(
    submission_id: int,
    artifact_type: str,
    current_user: AuthUser,
    *,
    db: Session,
    storage: StorageService,
) -> EvidenceFile:
    _touch_authorization(current_user)
    clean_type = artifact_type.strip().lower()
    if clean_type not in VALID_ARTIFACT_TYPES:
        raise InvalidArtifactType(f"'{artifact_type}' is not a supported artifact type.")

    submission = _require_submission(db, submission_id)

    if clean_type == ARTIFACT_ORIGINAL:
        try:
            return EvidenceFile(
                filename=submission.original_filename,
                content=storage.retrieve(submission.original_storage_key),
                content_type="application/octet-stream",
            )
        except StorageError as exc:
            raise EvidenceNotFound("Original evidence file was not found.") from exc

    if clean_type == ARTIFACT_PROCESSED:
        try:
            return EvidenceFile(
                filename=f"processed-{submission.id}-{submission.original_filename}",
                content=storage.retrieve(submission.processed_storage_key),
                content_type="text/csv",
            )
        except StorageError as exc:
            raise EvidenceNotFound("Processed evidence file was not found.") from exc

    review = get_review_for_submission(db, submission.id)
    if review is None:
        raise EvidenceNotFound("Audit report is not available for this submission.")
    return EvidenceFile(
        filename=f"audit-report-submission-{submission.id}.txt",
        content=_audit_report_content(submission, review),
        content_type="text/plain; charset=utf-8",
    )

from collections.abc import Awaitable, Callable
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from backend.app.auth.dependencies import get_current_user, require_roles
from backend.app.auth.models import AuthUser, UserRole
from backend.app.core.config import Settings, get_settings
from backend.app.core.database import get_db
from backend.app.core.errors import api_error
from backend.app.storage.base import StorageService
from backend.app.storage.dependencies import get_storage_service
from backend.app.storage.models import ACCEPTED_UPLOAD_EXTENSIONS
from backend.app.submissions.errors import (
    EvidenceNotFound,
    InvalidArtifactType,
    ProjectNotFound,
    SubmissionNotFound,
)
from backend.app.submissions.service import (
    SubmissionProcessingError,
    SubmissionResult,
    SubmissionValidationError,
    get_submission_processor,
)
from backend.app.submissions.traceability import (
    EvidenceMetadata,
    IntegrityResult,
    ReviewSummary,
    SubmissionDetail,
    SubmissionRecord,
    UploaderSummary,
    VersionLink,
    get_evidence,
    get_submission_detail,
    get_submission_history,
)

router = APIRouter(prefix="/submissions", tags=["submissions"])

SubmissionProcessor = Callable[[UploadFile, str, str, str, str, int | None], Awaitable[SubmissionResult]]


def submission_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"error": code, "message": message})


def required_text(value: str | None, field_name: str) -> str:
    clean_value = (value or "").strip()
    if not clean_value:
        raise submission_error(status.HTTP_400_BAD_REQUEST, "MISSING_METADATA", f"{field_name} is required.")
    return clean_value


def validate_file(file: UploadFile | None, settings: Settings) -> UploadFile:
    if file is None or not file.filename:
        raise submission_error(status.HTTP_400_BAD_REQUEST, "MISSING_FILE", "A CSV or XLSX file is required.")

    extension = Path(file.filename).suffix.lower()
    if extension not in ACCEPTED_UPLOAD_EXTENSIONS:
        raise submission_error(status.HTTP_400_BAD_REQUEST, "INVALID_FILE", "Only CSV and XLSX files are supported.")

    if file.size is not None and file.size > settings.max_upload_size_mb * 1024 * 1024:
        raise submission_error(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "FILE_TOO_LARGE",
            f"File must be {settings.max_upload_size_mb}MB or smaller.",
        )

    return file


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_submission(
    file: UploadFile | None = File(default=None),
    project_name: str | None = Form(default=None),
    organisation: str | None = Form(default=None),
    reporting_period: str | None = Form(default=None),
    previous_submission_id: int | None = Form(default=None),
    current_user: AuthUser = Depends(require_roles(UserRole.UPLOADER)),
    settings: Settings = Depends(get_settings),
    processor: SubmissionProcessor = Depends(get_submission_processor),
) -> dict[str, int | str]:
    upload_file = validate_file(file, settings)
    clean_project_name = required_text(project_name, "Project / Building name")
    clean_organisation = required_text(organisation, "Organisation")
    clean_reporting_period = required_text(reporting_period, "Reporting period")

    try:
        result = await processor(
            upload_file,
            clean_project_name,
            clean_organisation,
            clean_reporting_period,
            current_user.id,
            previous_submission_id,
        )
    except SubmissionValidationError as exc:
        raise submission_error(status.HTTP_400_BAD_REQUEST, "INVALID_FILE", str(exc)) from exc
    except SubmissionProcessingError as exc:
        raise submission_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "SUBMISSION_PROCESSING_FAILED",
            "Submission could not be processed. Please try again.",
        ) from exc
    except Exception as exc:
        raise submission_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "SUBMISSION_PROCESSING_FAILED",
            "Submission could not be processed. Please try again.",
        ) from exc

    return {
        "submission_id": result.submission_id,
        "status": result.status,
        "message": "Submission uploaded successfully",
    }


def _serialize_user(user: UploaderSummary) -> dict:
    return {"id": user.id, "name": user.name, "email": user.email}


def _serialize_review(review: ReviewSummary | None) -> dict | None:
    if review is None:
        return None
    return {
        "review_id": review.review_id,
        "reviewer_id": review.reviewer_id,
        "decision": review.decision,
        "reason": review.reason,
        "reviewed_at": review.reviewed_at.isoformat(),
    }


def _serialize_integrity(integrity: IntegrityResult | None) -> dict | None:
    if integrity is None:
        return None
    if integrity.matches is None:
        status_label = "UNAVAILABLE"
    else:
        status_label = "MATCH" if integrity.matches else "MISMATCH"
    return {
        "status": status_label,
        "expected_sha256": integrity.expected_hash,
        "actual_sha256": integrity.actual_hash,
        "matches": integrity.matches,
    }


def _serialize_evidence(metadata: EvidenceMetadata) -> dict:
    return {
        "artifact_type": metadata.artifact_type,
        "available": metadata.available,
        "filename": metadata.filename,
        "content_type": metadata.content_type,
        "size_bytes": metadata.size_bytes,
        "storage_backend": metadata.storage_backend,
        "sha256": metadata.sha256,
        "integrity": _serialize_integrity(metadata.integrity),
    }


def _serialize_version(version: VersionLink | None) -> dict | None:
    if version is None:
        return None
    return {
        "submission_id": version.submission_id,
        "reporting_period": version.reporting_period,
        "status": version.status,
        "submitted_at": version.submitted_at.isoformat(),
    }


def _serialize_record(record: SubmissionRecord) -> dict:
    return {
        "submission_id": record.submission_id,
        "project_id": record.project_id,
        "project_name": record.project_name,
        "organisation": record.organisation_name,
        "reporting_period": record.reporting_period,
        "status": record.status,
        "submitted_by": _serialize_user(record.submitted_by),
        "submitted_at": record.submitted_at.isoformat(),
        "review": _serialize_review(record.review),
        "evidence": {
            artifact_type: _serialize_evidence(metadata) for artifact_type, metadata in record.evidence.items()
        },
        "previous_submission": _serialize_version(record.previous_submission),
        "corrected_by": [_serialize_version(version) for version in record.corrected_by],
    }


def _serialize_detail(detail: SubmissionDetail) -> dict:
    payload = _serialize_record(detail)
    payload["metrics"] = [
        {
            "metric_name": metric.metric_name,
            "value": metric.value,
            "unit": metric.unit,
            "category": metric.category,
            "submission_id": metric.submission_id,
            "reporting_period": metric.reporting_period,
            "status": metric.status,
        }
        for metric in detail.metrics
    ]
    return payload


@router.get("/projects/{project_id}")
def project_submission_history(
    project_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
) -> dict:
    try:
        records = get_submission_history(project_id, current_user, db=db, storage=storage)
    except ProjectNotFound as exc:
        raise api_error(status.HTTP_404_NOT_FOUND, "PROJECT_NOT_FOUND", "Project was not found.") from exc

    return {"submissions": [_serialize_record(record) for record in records]}


@router.get("/{submission_id}")
def submission_detail(
    submission_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
) -> dict:
    try:
        detail = get_submission_detail(submission_id, current_user, db=db, storage=storage)
    except SubmissionNotFound as exc:
        raise api_error(status.HTTP_404_NOT_FOUND, "SUBMISSION_NOT_FOUND", "Submission was not found.") from exc

    return {"submission": _serialize_detail(detail)}


@router.get("/{submission_id}/evidence/{artifact_type:path}")
def submission_evidence(
    submission_id: int,
    artifact_type: str,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
) -> Response:
    try:
        evidence = get_evidence(submission_id, artifact_type, current_user, db=db, storage=storage)
    except InvalidArtifactType as exc:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "INVALID_EVIDENCE_TYPE",
            "Evidence type must be original, processed, or audit_report.",
        ) from exc
    except SubmissionNotFound as exc:
        raise api_error(status.HTTP_404_NOT_FOUND, "SUBMISSION_NOT_FOUND", "Submission was not found.") from exc
    except EvidenceNotFound as exc:
        raise api_error(status.HTTP_404_NOT_FOUND, "EVIDENCE_NOT_FOUND", "Evidence file is not available.") from exc

    safe_filename = quote(evidence.filename)
    return Response(
        content=evidence.content,
        media_type=evidence.content_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe_filename}"},
    )

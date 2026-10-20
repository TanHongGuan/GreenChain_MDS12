from collections.abc import Awaitable, Callable
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session
from sqlalchemy import select

from backend.app.auth.dependencies import get_current_user, require_permission
from backend.app.auth.models import AuthUser
from backend.app.auth.permissions import Permission
from backend.app.core.config import Settings, get_settings
from backend.app.core.database import get_db
from backend.app.core.errors import api_error
from backend.app.storage.base import StorageService
from backend.app.storage.dependencies import get_storage_service
from backend.app.storage.models import ACCEPTED_UPLOAD_EXTENSIONS
from backend.app.submissions.errors import (
    EvidenceIntegrityMismatch,
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
from backend.app.models.monthly_record import MonthlyRecord
from backend.app.models.submission import Submission, SUBMISSION_STATUS_APPROVED
from backend.app.models.project import Project
from backend.app.auth.models import UserRole
from backend.app.etl.ai_mapping import MappingUnavailable, inspect_sheets, inspection_payload, suggest_mapping
from backend.app.etl.monthly import classify_and_clean, read_input
from backend.app.etl.errors import ETLParseError, ETLValidationError

router = APIRouter(prefix="/submissions", tags=["submissions"])

SubmissionProcessor = Callable[..., Awaitable[SubmissionResult]]


def _monthly_access_allowed(submission: Submission, current_user: AuthUser, db: Session) -> bool:
    if submission.input_format == "LEGACY" or submission.status == SUBMISSION_STATUS_APPROVED:
        return True
    if current_user.role == UserRole.AUDITOR:
        return True
    project = db.get(Project, submission.project_id)
    return bool(current_user.role == UserRole.UPLOADER and project and project.organisation_id == current_user.organisation_id)


def _require_monthly_access(submission_id: int, current_user: AuthUser, db: Session) -> None:
    submission = db.get(Submission, submission_id)
    if submission is not None and not _monthly_access_allowed(submission, current_user, db):
        raise api_error(status.HTTP_404_NOT_FOUND, "SUBMISSION_NOT_FOUND", "Submission was not found.")


def submission_error(status_code: int, code: str, message: str, issues: tuple = ()) -> HTTPException:
    detail = {"error": code, "message": message}
    if issues:
        # The uploader needs every fault at once; the message reads them out, and
        # this gives the UI the same list already broken into rows.
        detail["issues"] = [issue.as_dict() for issue in issues]
    return HTTPException(status_code=status_code, detail=detail)


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
    project_id: int | None = Form(default=None),
    confirmed_mapping: str | None = Form(default=None),
    # Opt-in, default off: an incomplete quarter is refused unless the uploader
    # states that the shortfall is intended. Existing clients are unaffected.
    confirm_partial_quarter: bool = Form(default=False),
    current_user: AuthUser = Depends(require_permission(Permission.UPLOAD_SUBMISSION)),
    settings: Settings = Depends(get_settings),
    processor: SubmissionProcessor = Depends(get_submission_processor),
) -> dict[str, int | str | None]:
    upload_file = validate_file(file, settings)
    clean_project_name = (project_name or "").strip() if project_id is not None else required_text(project_name, "Project / Building name")
    clean_organisation = (organisation or "").strip() if project_id is not None else required_text(organisation, "Organisation")
    clean_reporting_period = required_text(reporting_period, "Reporting period")

    try:
        args = (upload_file, clean_project_name, clean_organisation, clean_reporting_period, current_user.id, previous_submission_id)
        extra: dict = {"allow_partial_quarter": confirm_partial_quarter}
        if project_id is not None or confirmed_mapping is not None:
            extra["project_id"] = project_id
            extra["organisation_id"] = current_user.organisation_id
            if confirmed_mapping is not None:
                extra["mapping_json"] = confirmed_mapping
        result = await processor(*args, **extra)
    except SubmissionValidationError as exc:
        raise submission_error(status.HTTP_400_BAD_REQUEST, "INVALID_FILE", str(exc), exc.issues) from exc
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

    payload = {
        "submission_id": result.submission_id,
        "status": result.status,
        "message": "Submission uploaded successfully",
    }
    if result.input_format != "LEGACY" or project_id is not None:
        payload.update({
            "project_id": result.project_id,
            "input_format": result.input_format,
            "monthly_record_count": result.monthly_record_count,
            "processing_status": result.processing_status,
        })
    return payload


@router.post("/mapping-preview")
async def mapping_preview(
    file: UploadFile | None = File(default=None),
    _: AuthUser = Depends(require_permission(Permission.UPLOAD_SUBMISSION)),
    settings: Settings = Depends(get_settings),
) -> dict:
    upload = validate_file(file, settings)
    raw = await upload.read()
    if not raw:
        raise submission_error(status.HTTP_400_BAD_REQUEST, "INVALID_FILE", "Uploaded file is empty.")
    if len(raw) > settings.max_upload_size_mb * 1024 * 1024:
        raise submission_error(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "FILE_TOO_LARGE", "File exceeds upload limit.")
    extension = Path(upload.filename).suffix.lower()
    try:
        try:
            headers, rows = read_input(raw, extension)
            input_format, _ = classify_and_clean(headers, rows)
            return {"kind": "known", "input_format": input_format}
        except ETLValidationError:
            pass
        sheets = inspect_sheets(raw, extension, sample_only=True)
        suggestion = await suggest_mapping(sheets, settings.gemini_api_key, settings.gemini_model)
        return {"kind": "ai_mapping", "mapping": suggestion.model_dump(), "sheets": inspection_payload(sheets),
                "model": settings.gemini_model}
    except (ETLParseError, ETLValidationError) as exc:
        raise submission_error(status.HTTP_400_BAD_REQUEST, "INVALID_FILE", str(exc),
                               getattr(exc, "issues", ())) from exc
    except MappingUnavailable as exc:
        raise submission_error(status.HTTP_503_SERVICE_UNAVAILABLE, "AI_MAPPING_UNAVAILABLE", str(exc)) from exc


@router.get("/{submission_id}/monthly")
def submission_monthly_records(
    submission_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    submission = db.get(Submission, submission_id)
    if submission is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "SUBMISSION_NOT_FOUND", "Submission was not found.")
    project = db.get(Project, submission.project_id)
    is_owner = current_user.role == UserRole.UPLOADER and project is not None and project.organisation_id == current_user.organisation_id
    if submission.status != SUBMISSION_STATUS_APPROVED and not (is_owner or current_user.role == UserRole.AUDITOR):
        raise api_error(status.HTTP_404_NOT_FOUND, "SUBMISSION_NOT_FOUND", "Submission was not found.")
    rows = db.scalars(select(MonthlyRecord).where(MonthlyRecord.submission_id == submission_id).order_by(MonthlyRecord.reporting_period)).all()
    return {
        "submission_id": submission.id,
        "project_id": submission.project_id,
        "input_format": submission.input_format,
        "processing_status": submission.processing_status,
        "review_status": submission.status,
        "monthly_records": [
            {"reporting_period": row.reporting_period, "electricity_kwh": str(row.electricity_kwh),
             "water_m3": str(row.water_m3), "co2_tco2e": str(row.co2_tco2e)} for row in rows
        ],
    }


def _serialize_user(user: UploaderSummary) -> dict:
    return {"id": user.id, "name": user.name, "email": user.email}


def _serialize_review(review: ReviewSummary | None) -> dict | None:
    if review is None:
        return None
    return {
        "review_id": review.review_id,
        "reviewer_id": review.reviewer_id,
        "reviewer_name": review.reviewer_name,
        "reviewer_email": review.reviewer_email,
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
        "algorithm": "SHA-256",
        "expected_sha256": integrity.expected_hash,
        "actual_sha256": integrity.actual_hash,
        "storage_sha256": integrity.storage_hash,
        "trusted_reference": integrity.trusted_reference,
        "version_id": integrity.version_id,
        "checked_at": integrity.checked_at.isoformat() if integrity.checked_at else None,
        "reason": integrity.reason,
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
        "version_id": metadata.version_id,
        "retention_mode": metadata.retention_mode,
        "retain_until": metadata.retain_until.isoformat() if metadata.retain_until else None,
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
    payload["input_format"] = detail.input_format
    payload["confirmed_mapping"] = detail.confirmed_mapping
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

    return {"submissions": [_serialize_record(record) for record in records
                            if (submission := db.get(Submission, record.submission_id)) is not None
                            and _monthly_access_allowed(submission, current_user, db)]}


@router.get("/{submission_id}")
def submission_detail(
    submission_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
) -> dict:
    _require_monthly_access(submission_id, current_user, db)
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
    _require_monthly_access(submission_id, current_user, db)
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
    except EvidenceIntegrityMismatch as exc:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "EVIDENCE_INTEGRITY_MISMATCH",
            "Evidence failed SHA-256 verification and was not served.",
        ) from exc

    safe_filename = quote(evidence.filename)
    headers = {"Content-Disposition": f"attachment; filename*=UTF-8''{safe_filename}"}
    if evidence.integrity is not None:
        headers["X-Evidence-Integrity"] = evidence.integrity.status or ""
        headers["X-Evidence-SHA256"] = evidence.integrity.actual_hash or ""
        if evidence.integrity.version_id:
            headers["X-Evidence-Version-Id"] = evidence.integrity.version_id
    return Response(content=evidence.content, media_type=evidence.content_type, headers=headers)

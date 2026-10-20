import logging
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from fastapi import Depends, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import select

from backend.app.core.config import Settings, get_settings
from backend.app.core.database import get_db
from backend.app.etl.errors import ETLParseError, ETLValidationError
from backend.app.etl.monthly import build_monthly_csv, classify_and_clean, read_input, require_submission_quarter
from backend.app.etl.ai_mapping import MappingSuggestion, process_confirmed_mapping
from pydantic import ValidationError
from backend.app.etl.transform import clean_rows
from backend.app.etl.transform import CanonicalMetricRow
from backend.app.etl.writer import build_processed_csv
from backend.app.integrity.hashing import calculate_sha256
from backend.app.repositories.metrics import bulk_create_metrics
from backend.app.models.monthly_record import MonthlyRecord
from backend.app.models.project import Project
from backend.app.models.submission import SUBMISSION_STATUS_REJECTED, Submission
from backend.app.repositories.projects import get_or_create_project
from backend.app.repositories.submissions import create_submission, get_submission_by_id
from backend.app.storage.base import StorageService
from backend.app.storage.dependencies import get_storage_service
from backend.app.storage.exceptions import StorageError
from backend.app.storage.models import StoredFile

logger = logging.getLogger(__name__)

class SubmissionValidationError(Exception):
    """Raised when accepted upload data fails downstream validation.

    ``issues`` carries the row-level faults an ETL refusal found, so the API can
    hand the uploader the whole list instead of one fault per attempt.
    """

    def __init__(self, message: str, issues: tuple = ()) -> None:
        super().__init__(message)
        self.issues = tuple(issues)


class SubmissionProcessingError(Exception):
    """Raised when submission processing cannot complete."""


@dataclass(frozen=True)
class SubmissionResult:
    submission_id: int
    status: str = "UNREVIEWED"
    project_id: int | None = None
    input_format: str = "LEGACY"
    monthly_record_count: int = 0
    processing_status: str = "COMPLETED"


async def process_submission(
    file: UploadFile,
    project_name: str,
    organisation: str,
    reporting_period: str,
    uploader_id: str,
    *,
    db: Session,
    storage: StorageService,
    settings: Settings | None = None,
    previous_submission_id: int | None = None,
    project_id: int | None = None,
    organisation_id: str | None = None,
    mapping_json: str | None = None,
    allow_partial_quarter: bool = False,
) -> SubmissionResult:
    """Sprint 2 upload pipeline: validate, transform, store, and persist."""
    settings = settings or get_settings()

    if not file.filename:
        raise SubmissionValidationError("A CSV or XLSX file is required.")

    extension = Path(file.filename).suffix.lower()
    if extension not in {".csv", ".xlsx"}:
        raise SubmissionValidationError("Only CSV and XLSX files are supported.")

    raw_bytes = await file.read()
    if not raw_bytes:
        raise SubmissionValidationError("Uploaded file is empty.")

    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(raw_bytes) > max_bytes:
        raise SubmissionValidationError(f"File must be {settings.max_upload_size_mb}MB or smaller.")

    try:
        if mapping_json is not None:
            suggestion = MappingSuggestion.model_validate_json(mapping_json)
            monthly_rows = process_confirmed_mapping(raw_bytes, extension, suggestion)
            input_format = "MONTHLY_AI_MAPPED"
        else:
            headers, raw_rows = read_input(raw_bytes, extension)
            input_format, monthly_rows = classify_and_clean(headers, raw_rows)
        if monthly_rows is not None:
            require_submission_quarter(monthly_rows, reporting_period, allow_partial_quarter=allow_partial_quarter)
            cleaned_rows = [
                CanonicalMetricRow(name, float(sum(getattr(row, field) for row in monthly_rows)), unit)
                for name, field, unit in (
                    ("Electricity", "electricity_kwh", "kWh"),
                    ("Water", "water_m3", "m3"),
                    ("CO2e", "co2_tco2e", "tCO2e"),
                )
            ]
        else:
            cleaned_rows = clean_rows(headers, raw_rows)
    except (ETLParseError, ETLValidationError, ValidationError) as exc:
        raise SubmissionValidationError(str(exc), getattr(exc, "issues", ())) from exc

    previous_submission = None
    if previous_submission_id is not None:
        previous_submission = get_submission_by_id(db, previous_submission_id)
        if previous_submission is None:
            raise SubmissionValidationError("Corrected submission was not found.")

    original_sha256 = calculate_sha256(BytesIO(raw_bytes))
    processed_bytes = build_monthly_csv(monthly_rows) if monthly_rows is not None else build_processed_csv(cleaned_rows)

    try:
        if project_id is not None:
            project = db.get(Project, project_id)
            if project is None or organisation_id is None or project.organisation_id != organisation_id:
                raise SubmissionValidationError("Select a building owned by your organisation.")
        elif monthly_rows is not None:
            raise SubmissionValidationError("Select an owned building before uploading monthly data.")
        else:
            project = get_or_create_project(db, project_name, organisation)
        if previous_submission is not None and previous_submission.project_id != project.id:
            db.rollback()
            raise SubmissionValidationError("Corrections must belong to the same project as the prior submission.")
        if monthly_rows is not None:
            months = [row.reporting_period for row in monthly_rows]
            overlaps = db.scalars(
                select(MonthlyRecord)
                .join(Submission, MonthlyRecord.submission_id == Submission.id)
                .where(MonthlyRecord.project_id == project.id)
                .where(MonthlyRecord.reporting_period.in_(months))
                .where(Submission.status != SUBMISSION_STATUS_REJECTED)
            ).all()
            if any(record.submission_id != previous_submission_id for record in overlaps):
                raise SubmissionValidationError(
                    "Monthly periods already exist for this building. Use an explicit correction of the prior submission."
                )
    except SubmissionValidationError:
        raise
    except Exception as exc:
        db.rollback()
        raise SubmissionProcessingError("Submission project could not be resolved.") from exc

    try:
        original_file = storage.store_original(BytesIO(raw_bytes), file.filename, file.content_type)
    except StorageError as exc:
        db.rollback()
        raise SubmissionProcessingError("Original file could not be stored.") from exc

    if original_file.sha256 is not None and original_file.sha256 != original_sha256:
        db.rollback()
        _discard_stored_files(storage, [original_file])
        raise SubmissionProcessingError("Stored original does not match the uploaded bytes.")

    try:
        processed_file = storage.store_processed(
            BytesIO(processed_bytes), f"{Path(file.filename).stem}.csv", "text/csv"
        )
    except StorageError as exc:
        db.rollback()
        _discard_stored_files(storage, [original_file])
        raise SubmissionProcessingError("Processed file could not be stored.") from exc

    try:
        submission = create_submission(
            db,
            project_id=project.id,
            uploader_id=uploader_id,
            reporting_period=reporting_period,
            original_filename=file.filename,
            original_storage_key=original_file.storage_key,
            processed_storage_key=processed_file.storage_key,
            original_sha256=original_sha256,
            previous_submission_id=previous_submission_id,
            storage_backend=original_file.storage_backend,
            original_version_id=original_file.version_id,
            original_retention_mode=original_file.retention_mode,
            original_retain_until=original_file.retain_until,
            processed_version_id=processed_file.version_id,
            processed_sha256=processed_file.sha256 or calculate_sha256(BytesIO(processed_bytes)),
            input_format=input_format,
            mapping_json=suggestion.model_dump_json() if mapping_json is not None else None,
            processed_retention_mode=processed_file.retention_mode,
            processed_retain_until=processed_file.retain_until,
        )
        bulk_create_metrics(db, submission.id, cleaned_rows)
        if monthly_rows is not None:
            db.add_all([
                MonthlyRecord(
                    submission_id=submission.id,
                    project_id=project.id,
                    reporting_period=row.reporting_period,
                    electricity_kwh=row.electricity_kwh,
                    water_m3=row.water_m3,
                    co2_tco2e=row.co2_tco2e,
                )
                for row in monthly_rows
            ])
        db.commit()
    except Exception as exc:
        db.rollback()
        _discard_stored_files(storage, [processed_file, original_file])
        raise SubmissionProcessingError("Submission could not be saved.") from exc

    return SubmissionResult(
        submission_id=submission.id, status=submission.status, project_id=project.id,
        input_format=input_format, monthly_record_count=len(monthly_rows or []),
    )


def _discard_stored_files(storage: StorageService, stored_files: list[StoredFile]) -> None:
    """Best-effort removal of evidence written for a submission that was never recorded.

    Under S3 Object Lock the delete is refused and the locked version remains until retention
    expires. That orphan is intentional (WORM evidence cannot be removed early) and is logged so it
    can be reconciled; it is never referenced by a submission row.
    """
    for stored in stored_files:
        try:
            storage.delete_if_allowed(stored.storage_key, stored.version_id)
        except StorageError as exc:
            logger.warning(
                "Unreferenced evidence retained after failed submission: backend=%s key=%s version=%s (%s)",
                stored.storage_backend,
                stored.storage_key,
                stored.version_id,
                exc,
            )


def get_submission_processor(
    db: Session = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
    settings: Settings = Depends(get_settings),
):
    async def processor(
        file: UploadFile,
        project_name: str,
        organisation: str,
        reporting_period: str,
        uploader_id: str,
        previous_submission_id: int | None = None,
        project_id: int | None = None,
        organisation_id: str | None = None,
        mapping_json: str | None = None,
        allow_partial_quarter: bool = False,
    ) -> SubmissionResult:
        return await process_submission(
            file,
            project_name,
            organisation,
            reporting_period,
            uploader_id,
            db=db,
            storage=storage,
            settings=settings,
            previous_submission_id=previous_submission_id,
            project_id=project_id,
            organisation_id=organisation_id,
            allow_partial_quarter=allow_partial_quarter,
            mapping_json=mapping_json,
        )

    return processor

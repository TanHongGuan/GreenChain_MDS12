from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from fastapi import Depends, UploadFile
from sqlalchemy.orm import Session

from backend.app.core.config import Settings, get_settings
from backend.app.core.database import get_db
from backend.app.etl.errors import ETLParseError, ETLValidationError
from backend.app.etl.readers import read_csv_rows, read_xlsx_rows
from backend.app.etl.transform import clean_rows
from backend.app.etl.writer import build_processed_csv
from backend.app.integrity.hashing import calculate_sha256
from backend.app.repositories.metrics import bulk_create_metrics
from backend.app.repositories.projects import get_or_create_project
from backend.app.repositories.submissions import create_submission
from backend.app.storage.base import StorageService
from backend.app.storage.dependencies import get_storage_service
from backend.app.storage.exceptions import StorageError


class SubmissionValidationError(Exception):
    """Raised when accepted upload data fails downstream validation."""


class SubmissionProcessingError(Exception):
    """Raised when submission processing cannot complete."""


@dataclass(frozen=True)
class SubmissionResult:
    submission_id: int
    status: str = "UNREVIEWED"


_PARSERS = {
    ".csv": read_csv_rows,
    ".xlsx": read_xlsx_rows,
}


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
) -> SubmissionResult:
    """Sprint 2 ETL/storage/persistence pipeline: validate -> store original -> hash
    -> parse -> clean -> canonical dataset -> store processed -> persist -> UNREVIEWED.
    """
    settings = settings or get_settings()

    if not file.filename:
        raise SubmissionValidationError("A CSV or XLSX file is required.")

    extension = Path(file.filename).suffix.lower()
    parser = _PARSERS.get(extension)
    if parser is None:
        raise SubmissionValidationError("Only CSV and XLSX files are supported.")

    raw_bytes = await file.read()
    if not raw_bytes:
        raise SubmissionValidationError("Uploaded file is empty.")

    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(raw_bytes) > max_bytes:
        raise SubmissionValidationError(f"File must be {settings.max_upload_size_mb}MB or smaller.")

    original_sha256 = calculate_sha256(BytesIO(raw_bytes))

    try:
        original_file = storage.store_original(BytesIO(raw_bytes), file.filename, file.content_type)
    except StorageError as exc:
        raise SubmissionProcessingError("Original file could not be stored.") from exc

    try:
        headers, raw_rows = parser(raw_bytes)
        cleaned_rows = clean_rows(headers, raw_rows)
    except (ETLParseError, ETLValidationError) as exc:
        raise SubmissionValidationError(str(exc)) from exc

    processed_bytes = build_processed_csv(cleaned_rows)

    try:
        processed_file = storage.store_processed(
            BytesIO(processed_bytes), f"{Path(file.filename).stem}.csv", "text/csv"
        )
    except StorageError as exc:
        raise SubmissionProcessingError("Processed file could not be stored.") from exc

    try:
        project = get_or_create_project(db, project_name, organisation)
        submission = create_submission(
            db,
            project_id=project.id,
            uploader_id=uploader_id,
            reporting_period=reporting_period,
            original_filename=file.filename,
            original_storage_key=original_file.storage_key,
            processed_storage_key=processed_file.storage_key,
            original_sha256=original_sha256,
        )
        bulk_create_metrics(db, submission.id, cleaned_rows)
        db.commit()
    except Exception as exc:
        db.rollback()
        try:
            storage.delete_if_allowed(processed_file.storage_key)
        except StorageError:
            pass
        raise SubmissionProcessingError("Submission could not be saved.") from exc

    return SubmissionResult(submission_id=submission.id, status=submission.status)


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
        )

    return processor

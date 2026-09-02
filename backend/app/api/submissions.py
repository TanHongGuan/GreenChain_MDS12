from collections.abc import Awaitable, Callable
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from backend.app.auth.dependencies import require_roles
from backend.app.auth.models import AuthUser, UserRole
from backend.app.core.config import Settings, get_settings
from backend.app.storage.models import ACCEPTED_UPLOAD_EXTENSIONS
from backend.app.submissions.service import (
    SubmissionProcessingError,
    SubmissionResult,
    SubmissionValidationError,
    get_submission_processor,
)

router = APIRouter(prefix="/submissions", tags=["submissions"])

SubmissionProcessor = Callable[[UploadFile, str, str, str, str], Awaitable[SubmissionResult]]


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

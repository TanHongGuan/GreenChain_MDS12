from dataclasses import dataclass
from itertools import count

from fastapi import UploadFile


class SubmissionValidationError(Exception):
    """Raised when accepted upload data fails downstream validation."""


class SubmissionProcessingError(Exception):
    """Raised when submission processing cannot complete."""


@dataclass(frozen=True)
class SubmissionResult:
    submission_id: int
    status: str = "UNREVIEWED"


_submission_ids = count(1)


async def process_submission(
    file: UploadFile,
    project_name: str,
    organisation: str,
    reporting_period: str,
    uploader_id: str,
) -> SubmissionResult:
    """Sprint 2 handoff point for ETL/storage/database implementation."""
    if not file.filename:
        raise SubmissionValidationError("A CSV or XLSX file is required.")

    return SubmissionResult(submission_id=next(_submission_ids))


def get_submission_processor():
    return process_submission

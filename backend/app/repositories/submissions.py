from sqlalchemy.orm import Session

from backend.app.models.submission import SUBMISSION_STATUS_UNREVIEWED, Submission


def create_submission(
    db: Session,
    *,
    project_id: int,
    uploader_id: str,
    reporting_period: str,
    original_filename: str,
    original_storage_key: str,
    processed_storage_key: str,
    original_sha256: str,
) -> Submission:
    submission = Submission(
        project_id=project_id,
        uploader_id=uploader_id,
        reporting_period=reporting_period,
        status=SUBMISSION_STATUS_UNREVIEWED,
        original_filename=original_filename,
        original_storage_key=original_storage_key,
        processed_storage_key=processed_storage_key,
        original_sha256=original_sha256,
    )
    db.add(submission)
    db.flush()
    return submission

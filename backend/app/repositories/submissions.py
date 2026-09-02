from collections.abc import Iterable

from sqlalchemy import select, update
from sqlalchemy.orm import Session, joinedload, selectinload

from backend.app.models.project import Project
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


def _with_review_context(stmt):
    return stmt.options(
        joinedload(Submission.project).joinedload(Project.organisation),
        joinedload(Submission.uploader),
    )


def get_submission_by_id(db: Session, submission_id: int) -> Submission | None:
    stmt = _with_review_context(select(Submission)).where(Submission.id == submission_id)
    return db.scalars(stmt).first()


def list_unreviewed_submissions(db: Session) -> list[Submission]:
    stmt = (
        _with_review_context(select(Submission))
        .where(Submission.status == SUBMISSION_STATUS_UNREVIEWED)
        .order_by(Submission.created_at.asc())
    )
    return list(db.scalars(stmt).unique().all())


def update_submission_status_if_unreviewed(db: Session, submission_id: int, new_status: str) -> bool:
    """Atomically transition a submission out of UNREVIEWED.

    The WHERE clause is evaluated and applied as part of the UPDATE itself, so two
    concurrent decisions on the same submission cannot both succeed: whichever commits
    first wins, and the second finds status no longer UNREVIEWED and updates zero rows.
    """
    stmt = (
        update(Submission)
        .where(Submission.id == submission_id, Submission.status == SUBMISSION_STATUS_UNREVIEWED)
        .values(status=new_status)
    )
    result = db.execute(stmt)
    return result.rowcount > 0


def list_submissions_for_project(db: Session, project_id: int, statuses: Iterable[str]) -> list[Submission]:
    stmt = (
        select(Submission)
        .where(Submission.project_id == project_id, Submission.status.in_(list(statuses)))
        .options(selectinload(Submission.metrics))
    )
    return list(db.scalars(stmt).unique().all())

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models.review import Review


def create_review(
    db: Session,
    *,
    submission_id: int,
    reviewer_id: str,
    decision: str,
    reason: str | None = None,
) -> Review:
    review = Review(
        submission_id=submission_id,
        reviewer_id=reviewer_id,
        decision=decision,
        reason=reason,
    )
    db.add(review)
    db.flush()
    return review


def get_review_for_submission(db: Session, submission_id: int) -> Review | None:
    stmt = select(Review).where(Review.submission_id == submission_id)
    return db.scalars(stmt).first()

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.database import Base

REVIEW_DECISION_APPROVED = "APPROVED"
REVIEW_DECISION_REJECTED = "REJECTED"


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (
        CheckConstraint("decision IN ('APPROVED', 'REJECTED')", name="ck_reviews_decision_valid"),
        UniqueConstraint("submission_id", name="uq_reviews_submission_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("submissions.id", ondelete="RESTRICT"), nullable=False)
    reviewer_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    decision: Mapped[str] = mapped_column(String(32), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    submission = relationship("Submission", back_populates="reviews")
    reviewer = relationship("User")

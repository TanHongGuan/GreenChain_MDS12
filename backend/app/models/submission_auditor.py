from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.core.database import Base


class SubmissionAuditor(Base):
    """One auditor appointed by the owning company to review one submission.

    A quarter is what gets reviewed, so a quarter is what gets reviewers, and it
    may have more than one. Whoever decides first settles it; the others are
    there so the company can choose who is able to.
    """

    __tablename__ = "submission_auditors"

    submission_id: Mapped[int] = mapped_column(
        ForeignKey("submissions.id", ondelete="CASCADE"), primary_key=True
    )
    auditor_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), primary_key=True, index=True
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

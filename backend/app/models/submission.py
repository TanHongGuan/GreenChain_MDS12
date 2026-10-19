from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.database import Base

SUBMISSION_STATUS_UNREVIEWED = "UNREVIEWED"
SUBMISSION_STATUS_APPROVED = "APPROVED"
SUBMISSION_STATUS_REJECTED = "REJECTED"


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False)
    uploader_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    reporting_period: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default=SUBMISSION_STATUS_UNREVIEWED)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_storage_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    processed_storage_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    original_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    # Evidence storage references. Version IDs pin the exact immutable S3 object versions; they are
    # NULL for the unversioned local backend and for rows created before migration 20261019_0007.
    storage_backend: Mapped[str] = mapped_column(String(32), nullable=False, default="local", server_default="local")
    original_version_id: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    original_retention_mode: Mapped[str | None] = mapped_column(String(32), nullable=True)
    original_retain_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    processed_version_id: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    processed_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    processed_retention_mode: Mapped[str | None] = mapped_column(String(32), nullable=True)
    processed_retain_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    previous_submission_id: Mapped[int | None] = mapped_column(
        ForeignKey("submissions.id", ondelete="RESTRICT"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    project = relationship("Project", back_populates="submissions")
    uploader = relationship("User")
    metrics = relationship("Metric", back_populates="submission", cascade="all, delete-orphan")
    reviews = relationship("Review", back_populates="submission")
    previous_submission = relationship("Submission", remote_side=[id], back_populates="corrections")
    corrections = relationship("Submission", back_populates="previous_submission")

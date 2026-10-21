from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.database import Base


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        UniqueConstraint("name", "organisation_id", name="uq_projects_name_organisation_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Benchmark-scope attributes (Sprint 8). Nullable because projects created before
    # Sprint 8, or uploaded without them, legitimately have no known scope - and an
    # unknown scope must suppress the comparison rather than guess one.
    country: Mapped[str | None] = mapped_column(String(128), nullable=True)
    property_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    organisation_id: Mapped[str] = mapped_column(
        ForeignKey("organisations.id", ondelete="RESTRICT"), nullable=False
    )
    # The auditor the owning company has appointed to review this building. Null
    # until they appoint one, and while it is null nobody may review the
    # building's submissions - a reviewer is assigned, never assumed.
    auditor_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    organisation = relationship("Organisation")
    auditor = relationship("User", foreign_keys=[auditor_id])
    submissions = relationship("Submission", back_populates="project")

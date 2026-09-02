from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.database import Base


class OrganisationMember(Base):
    __tablename__ = "organisation_members"
    __table_args__ = (UniqueConstraint("user_id", name="uq_organisation_members_user_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    user = relationship("User", back_populates="organisation_membership")
    organisation = relationship("Organisation", back_populates="members")

from decimal import Decimal

from sqlalchemy import ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.database import Base


class MonthlyRecord(Base):
    __tablename__ = "monthly_records"
    __table_args__ = (UniqueConstraint("submission_id", "reporting_period", name="uq_monthly_submission_period"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False)
    reporting_period: Mapped[str] = mapped_column(String(7), nullable=False)
    electricity_kwh: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    water_m3: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    co2_tco2e: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)

    submission = relationship("Submission", back_populates="monthly_records")

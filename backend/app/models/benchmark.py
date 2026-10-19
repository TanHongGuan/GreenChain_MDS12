from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Float, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.core.database import Base


class Benchmark(Base):
    """An external sustainability target a project metric can be compared against.

    Every row carries its own provenance (provider + source_name + source_version)
    because a benchmark without an attributable source cannot be shown to an
    investor - the API refuses to expose a comparison it cannot cite.

    Scope columns (country, property_type, year) define which projects a row
    legitimately applies to. A benchmark is only ever matched to a project whose
    own country/property_type are known and equal; see benchmarks/service.py.
    """

    __tablename__ = "benchmarks"
    __table_args__ = (
        UniqueConstraint(
            "provider",
            "source_version",
            "country",
            "property_type",
            "year",
            "metric_name",
            name="uq_benchmarks_source_scope_metric",
        ),
        CheckConstraint("value >= 0", name="ck_benchmarks_value_non_negative"),
        CheckConstraint("year >= 1990 AND year <= 2100", name="ck_benchmarks_year_plausible"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(String(255), nullable=False)
    source_name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_version: Mapped[str] = mapped_column(String(64), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    country: Mapped[str] = mapped_column(String(128), nullable=False)
    property_type: Mapped[str] = mapped_column(String(128), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    metric_name: Mapped[str] = mapped_column(String(255), nullable=False)
    unit: Mapped[str] = mapped_column(String(64), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

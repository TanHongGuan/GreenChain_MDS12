"""add sprint 8 benchmark tables and project benchmark scope

Revision ID: 20260903_0007
Revises: 20260903_0006
Create Date: 2026-09-03 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260903_0007"
down_revision: str | Sequence[str] | None = "20260903_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Additive only: both columns are nullable, so existing project rows stay valid
    # and simply report an unknown benchmark scope until they are backfilled.
    op.add_column("projects", sa.Column("country", sa.String(length=128), nullable=True))
    op.add_column("projects", sa.Column("property_type", sa.String(length=128), nullable=True))

    op.create_table(
        "benchmarks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("provider", sa.String(length=255), nullable=False),
        sa.Column("source_name", sa.String(length=255), nullable=False),
        sa.Column("source_version", sa.String(length=64), nullable=False),
        sa.Column("source_url", sa.String(length=1024), nullable=True),
        sa.Column("country", sa.String(length=128), nullable=False),
        sa.Column("property_type", sa.String(length=128), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("metric_name", sa.String(length=255), nullable=False),
        sa.Column("unit", sa.String(length=64), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("value >= 0", name="ck_benchmarks_value_non_negative"),
        sa.CheckConstraint("year >= 1990 AND year <= 2100", name="ck_benchmarks_year_plausible"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "provider",
            "source_version",
            "country",
            "property_type",
            "year",
            "metric_name",
            name="uq_benchmarks_source_scope_metric",
        ),
    )
    # Lookup path used by the comparison service: scope + metric, newest eligible year first.
    op.create_index(
        "ix_benchmarks_scope_metric_year",
        "benchmarks",
        ["country", "property_type", "metric_name", "year"],
    )
    op.create_index("ix_projects_property_type", "projects", ["property_type"])


def downgrade() -> None:
    op.drop_index("ix_projects_property_type", table_name="projects")
    op.drop_index("ix_benchmarks_scope_metric_year", table_name="benchmarks")
    op.drop_table("benchmarks")
    op.drop_column("projects", "property_type")
    op.drop_column("projects", "country")

"""Drop the benchmarks table.

Benchmark comparison was removed from GreenChain: the demo set was placeholder
figures, and nothing reads the table any more. Projects keep their country and
property type, which Manage Buildings still records.

Downgrade recreates the empty table exactly as 20260903_0007 created it; the
placeholder rows are not restored.

Revision ID: 20261021_0013
Revises: 20261021_0012
"""

from alembic import op
import sqlalchemy as sa

revision = "20261021_0013"
down_revision = "20261021_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_benchmarks_scope_metric_year", table_name="benchmarks")
    op.drop_table("benchmarks")


def downgrade() -> None:
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
    op.create_index(
        "ix_benchmarks_scope_metric_year",
        "benchmarks",
        ["country", "property_type", "metric_name", "year"],
    )

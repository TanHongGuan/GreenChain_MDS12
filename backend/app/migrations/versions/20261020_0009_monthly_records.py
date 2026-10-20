"""Add canonical monthly records without changing legacy submission data.

Revision ID: 20261020_0009
Revises: 20261019_0008
"""

from alembic import op
import sqlalchemy as sa

revision = "20261020_0009"
down_revision = "20261019_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("submissions", sa.Column("input_format", sa.String(32), nullable=False, server_default="LEGACY"))
    op.add_column("submissions", sa.Column("processing_status", sa.String(32), nullable=False, server_default="COMPLETED"))
    op.create_table(
        "monthly_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("submission_id", sa.Integer(), sa.ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("reporting_period", sa.String(7), nullable=False),
        sa.Column("electricity_kwh", sa.Numeric(24, 8), nullable=False),
        sa.Column("water_m3", sa.Numeric(24, 8), nullable=False),
        sa.Column("co2_tco2e", sa.Numeric(24, 8), nullable=False),
        sa.UniqueConstraint("submission_id", "reporting_period", name="uq_monthly_submission_period"),
    )
    op.create_index("ix_monthly_project_period", "monthly_records", ["project_id", "reporting_period"])


def downgrade() -> None:
    op.drop_index("ix_monthly_project_period", table_name="monthly_records")
    op.drop_table("monthly_records")
    op.drop_column("submissions", "processing_status")
    op.drop_column("submissions", "input_format")

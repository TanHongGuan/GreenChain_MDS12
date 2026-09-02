"""create sprint 2 project/submission/metric persistence tables

Revision ID: 20260902_0002
Revises: 20260902_0001
Create Date: 2026-09-02 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260902_0002"
down_revision: str | Sequence[str] | None = "20260902_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("organisation_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["organisation_id"], ["organisations.id"], name="fk_projects_organisation_id", ondelete="RESTRICT"
        ),
        sa.UniqueConstraint("name", "organisation_id", name="uq_projects_name_organisation_id"),
    )

    op.create_table(
        "submissions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("uploader_id", sa.String(length=36), nullable=False),
        sa.Column("reporting_period", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="UNREVIEWED"),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("original_storage_key", sa.String(length=1024), nullable=False),
        sa.Column("processed_storage_key", sa.String(length=1024), nullable=False),
        sa.Column("original_sha256", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], name="fk_submissions_project_id", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["uploader_id"], ["users.id"], name="fk_submissions_uploader_id", ondelete="RESTRICT"),
    )
    op.create_index("ix_submissions_project_id", "submissions", ["project_id"], unique=False)
    op.create_index("ix_submissions_uploader_id", "submissions", ["uploader_id"], unique=False)

    op.create_table(
        "metrics",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("submission_id", sa.Integer(), nullable=False),
        sa.Column("metric_name", sa.String(length=255), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(length=64), nullable=False),
        sa.Column("category", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["submission_id"], ["submissions.id"], name="fk_metrics_submission_id", ondelete="CASCADE"
        ),
    )
    op.create_index("ix_metrics_submission_id", "metrics", ["submission_id"], unique=False)


def downgrade() -> None:
    op.drop_table("metrics")
    op.drop_index("ix_submissions_uploader_id", table_name="submissions")
    op.drop_index("ix_submissions_project_id", table_name="submissions")
    op.drop_table("submissions")
    op.drop_table("projects")

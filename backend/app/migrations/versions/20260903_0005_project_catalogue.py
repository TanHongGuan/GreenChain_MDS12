"""add sprint 6 project catalogue fields and indexes

Revision ID: 20260903_0005
Revises: 20260902_0004
Create Date: 2026-09-03 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260903_0005"
down_revision: str | Sequence[str] | None = "20260902_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("location", sa.String(length=255), nullable=True))
    op.create_index("ix_projects_name", "projects", ["name"], unique=False)
    op.create_index("ix_projects_location", "projects", ["location"], unique=False)
    op.create_index("ix_submissions_project_created", "submissions", ["project_id", "created_at", "id"], unique=False)
    op.create_index("ix_submissions_status_period", "submissions", ["status", "reporting_period"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_submissions_status_period", table_name="submissions")
    op.drop_index("ix_submissions_project_created", table_name="submissions")
    op.drop_index("ix_projects_location", table_name="projects")
    op.drop_index("ix_projects_name", table_name="projects")
    op.drop_column("projects", "location")

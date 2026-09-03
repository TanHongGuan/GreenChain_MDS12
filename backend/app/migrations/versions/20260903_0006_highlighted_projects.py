"""add sprint 7 highlighted projects

Revision ID: 20260903_0006
Revises: 20260903_0005
Create Date: 2026-09-03 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260903_0006"
down_revision: str | Sequence[str] | None = "20260903_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "highlighted_projects",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "project_id", name="uq_highlighted_projects_user_project"),
    )
    op.create_index("ix_highlighted_projects_user_created", "highlighted_projects", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_highlighted_projects_user_created", table_name="highlighted_projects")
    op.drop_table("highlighted_projects")

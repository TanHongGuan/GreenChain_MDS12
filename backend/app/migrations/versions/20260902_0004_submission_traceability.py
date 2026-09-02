"""add sprint 5 submission traceability fields

Revision ID: 20260902_0004
Revises: 20260902_0003
Create Date: 2026-09-02 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260902_0004"
down_revision: str | Sequence[str] | None = "20260902_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("submissions", sa.Column("previous_submission_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_submissions_previous_submission_id",
        "submissions",
        "submissions",
        ["previous_submission_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_submissions_previous_submission_id", "submissions", ["previous_submission_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_submissions_previous_submission_id", table_name="submissions")
    op.drop_constraint("fk_submissions_previous_submission_id", "submissions", type_="foreignkey")
    op.drop_column("submissions", "previous_submission_id")

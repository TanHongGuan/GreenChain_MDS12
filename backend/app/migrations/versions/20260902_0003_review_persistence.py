"""create sprint 3 review persistence table

Revision ID: 20260902_0003
Revises: 20260902_0002
Create Date: 2026-09-02 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260902_0003"
down_revision: str | Sequence[str] | None = "20260902_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "reviews",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("submission_id", sa.Integer(), nullable=False),
        sa.Column("reviewer_id", sa.String(length=36), nullable=False),
        sa.Column("decision", sa.String(length=32), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("decision IN ('APPROVED', 'REJECTED')", name="ck_reviews_decision_valid"),
        sa.ForeignKeyConstraint(
            ["submission_id"], ["submissions.id"], name="fk_reviews_submission_id", ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["reviewer_id"], ["users.id"], name="fk_reviews_reviewer_id", ondelete="RESTRICT"),
        sa.UniqueConstraint("submission_id", name="uq_reviews_submission_id"),
    )
    op.create_index("ix_reviews_reviewer_id", "reviews", ["reviewer_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_reviews_reviewer_id", table_name="reviews")
    op.drop_table("reviews")

"""add evidence storage backend, S3 version and retention references to submissions

Revision ID: 20261019_0008
Revises: 20260903_0007
Create Date: 2026-10-19 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20261019_0008"
down_revision: str | Sequence[str] | None = "20260903_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Existing rows were written by the local backend, so the server default backfills them.
    op.add_column(
        "submissions",
        sa.Column("storage_backend", sa.String(length=32), nullable=False, server_default="local"),
    )
    op.add_column("submissions", sa.Column("original_version_id", sa.String(length=1024), nullable=True))
    op.add_column("submissions", sa.Column("original_retention_mode", sa.String(length=32), nullable=True))
    op.add_column("submissions", sa.Column("original_retain_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("submissions", sa.Column("processed_version_id", sa.String(length=1024), nullable=True))
    op.add_column("submissions", sa.Column("processed_sha256", sa.String(length=64), nullable=True))
    op.add_column("submissions", sa.Column("processed_retention_mode", sa.String(length=32), nullable=True))
    op.add_column("submissions", sa.Column("processed_retain_until", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("submissions", "processed_retain_until")
    op.drop_column("submissions", "processed_retention_mode")
    op.drop_column("submissions", "processed_sha256")
    op.drop_column("submissions", "processed_version_id")
    op.drop_column("submissions", "original_retain_until")
    op.drop_column("submissions", "original_retention_mode")
    op.drop_column("submissions", "original_version_id")
    op.drop_column("submissions", "storage_backend")

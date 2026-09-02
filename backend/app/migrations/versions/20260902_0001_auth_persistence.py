"""create sprint 1 auth persistence tables

Revision ID: 20260902_0001
Revises:
Create Date: 2026-09-02 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260902_0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "organisations",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("name", name="uq_organisations_name"),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=512), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("role IN ('VIEWER', 'UPLOADER', 'AUDITOR')", name="ck_users_role_valid"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=False)

    op.create_table(
        "organisation_members",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("organisation_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["organisation_id"], ["organisations.id"], name="fk_organisation_members_organisation_id", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_organisation_members_user_id", ondelete="RESTRICT"),
        sa.UniqueConstraint("user_id", name="uq_organisation_members_user_id"),
    )


def downgrade() -> None:
    op.drop_table("organisation_members")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
    op.drop_table("organisations")

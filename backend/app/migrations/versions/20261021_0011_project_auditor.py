"""Record which auditor a company has appointed to review a building.

Nullable on purpose: a building exists before anyone is appointed to it, and the
column has to be added to buildings that already exist. An unassigned building
has no reviewer, which is a state the review queue has to handle rather than a
state the schema forbids.

RESTRICT, not CASCADE: deleting an auditor account must not quietly detach the
buildings they were reviewing.

Revision ID: 20261021_0011
Revises: 20261020_0010
"""

from alembic import op
import sqlalchemy as sa

revision = "20261021_0011"
down_revision = "20261020_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("auditor_id", sa.String(length=36), nullable=True))
    op.create_foreign_key(
        "fk_projects_auditor_id_users", "projects", "users",
        ["auditor_id"], ["id"], ondelete="RESTRICT",
    )
    op.create_index("ix_projects_auditor_id", "projects", ["auditor_id"])


def downgrade() -> None:
    op.drop_index("ix_projects_auditor_id", table_name="projects")
    op.drop_constraint("fk_projects_auditor_id_users", "projects", type_="foreignkey")
    op.drop_column("projects", "auditor_id")

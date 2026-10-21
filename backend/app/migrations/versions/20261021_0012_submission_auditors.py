"""Assign auditors to a submission rather than to the building.

A quarter is the unit that gets reviewed, so it is the unit that gets reviewers,
and a submission can have more than one. The per-building column this replaces
could hold only a single auditor and said nothing about which quarter they were
appointed for.

Existing building-level appointments are carried onto that building's
submissions before the column goes, so an appointment already made is not lost
to a schema change.

Revision ID: 20261021_0012
Revises: 20261021_0011
"""

from alembic import op
import sqlalchemy as sa

revision = "20261021_0012"
down_revision = "20261021_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "submission_auditors",
        sa.Column("submission_id", sa.Integer(), nullable=False),
        sa.Column("auditor_id", sa.String(length=36), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["submission_id"], ["submissions.id"], ondelete="CASCADE"),
        # RESTRICT: removing an auditor account must not silently unassign the
        # submissions they were appointed to review.
        sa.ForeignKeyConstraint(["auditor_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("submission_id", "auditor_id"),
    )
    op.create_index("ix_submission_auditors_auditor_id", "submission_auditors", ["auditor_id"])

    op.execute(sa.text(
        "INSERT INTO submission_auditors (submission_id, auditor_id) "
        "SELECT s.id, p.auditor_id FROM submissions s "
        "JOIN projects p ON p.id = s.project_id WHERE p.auditor_id IS NOT NULL"
    ))

    op.drop_index("ix_projects_auditor_id", table_name="projects")
    op.drop_constraint("fk_projects_auditor_id_users", "projects", type_="foreignkey")
    op.drop_column("projects", "auditor_id")


def downgrade() -> None:
    op.add_column("projects", sa.Column("auditor_id", sa.String(length=36), nullable=True))
    op.create_foreign_key("fk_projects_auditor_id_users", "projects", "users",
                          ["auditor_id"], ["id"], ondelete="RESTRICT")
    op.create_index("ix_projects_auditor_id", "projects", ["auditor_id"])
    # Only one auditor fits in the column, so a submission with several keeps the
    # earliest. The downgrade cannot be lossless and does not pretend to be.
    op.execute(sa.text(
        "UPDATE projects SET auditor_id = ("
        "  SELECT sa.auditor_id FROM submission_auditors sa "
        "  JOIN submissions s ON s.id = sa.submission_id "
        "  WHERE s.project_id = projects.id ORDER BY sa.assigned_at, sa.auditor_id LIMIT 1)"
    ))
    op.drop_index("ix_submission_auditors_auditor_id", table_name="submission_auditors")
    op.drop_table("submission_auditors")

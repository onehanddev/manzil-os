"""add PENDING status to society_memberships for admin approval flow

Revision ID: d4e5f6a7b8c9
Revises: c3d8e1f9a2b4
Create Date: 2026-08-31
"""

from alembic import op

revision = "d4e5f6a7b8c9"
down_revision = "c3d8e1f9a2b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop old check, add new check with PENDING
    op.execute("ALTER TABLE society_memberships DROP CONSTRAINT IF EXISTS society_memberships_status_check")
    op.execute(
        """
        ALTER TABLE society_memberships
        ADD CONSTRAINT society_memberships_status_check
        CHECK (status IN ('ACTIVE', 'ENDED', 'SUSPENDED', 'PENDING'))
        """
    )


def downgrade() -> None:
    # Remove PENDING - need to ensure no PENDING rows exist
    op.execute("UPDATE society_memberships SET status='ACTIVE' WHERE status='PENDING'")
    op.execute("ALTER TABLE society_memberships DROP CONSTRAINT IF EXISTS society_memberships_status_check")
    op.execute(
        """
        ALTER TABLE society_memberships
        ADD CONSTRAINT society_memberships_status_check
        CHECK (status IN ('ACTIVE', 'ENDED', 'SUSPENDED'))
        """
    )

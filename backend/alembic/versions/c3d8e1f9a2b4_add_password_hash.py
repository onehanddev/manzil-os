"""add password_hash to users

Revision ID: c3d8e1f9a2b4
Revises: be8fc2f64365
Create Date: 2026-08-30
"""

from alembic import op

revision = "c3d8e1f9a2b4"
down_revision = "be8fc2f64365"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add password_hash column to users – keeps existing rows valid (nullable then set)
    op.execute(
        """
        ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS password_hash")

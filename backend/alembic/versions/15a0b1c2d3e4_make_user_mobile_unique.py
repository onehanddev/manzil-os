"""make user mobile unique for supabase identity mapping

Revision ID: 15a0b1c2d3e4
Revises: 14a0b1c2d3e4
Create Date: 2026-09-01
"""

from alembic import op

revision = "15a0b1c2d3e4"
down_revision = "14a0b1c2d3e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS users_mobile_key
        ON users (mobile)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS users_mobile_key")

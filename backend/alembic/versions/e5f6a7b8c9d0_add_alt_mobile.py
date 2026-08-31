"""add alt_mobile to persons

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-08-31
"""

from alembic import op

revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE persons ADD COLUMN IF NOT EXISTS alt_mobile TEXT")
    op.execute("ALTER TABLE persons ADD COLUMN IF NOT EXISTS alt_mobile_normalized TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE persons DROP COLUMN IF EXISTS alt_mobile")
    op.execute("ALTER TABLE persons DROP COLUMN IF EXISTS alt_mobile_normalized")

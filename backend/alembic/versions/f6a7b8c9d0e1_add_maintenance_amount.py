"""add maintenance_amount to flat_categories

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-08-31
"""

from alembic import op

revision = "f6a7b8c9d0e1"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE flat_categories ADD COLUMN IF NOT EXISTS maintenance_amount NUMERIC(12,2) CHECK (maintenance_amount IS NULL OR maintenance_amount >= 0)")


def downgrade() -> None:
    op.execute("ALTER TABLE flat_categories DROP COLUMN IF EXISTS maintenance_amount")

"""add receipt void/undo history – direct submit with audit trail

Revision ID: c9d0e1f2a3b4
Revises: b2c3d4e5f6a7
Create Date: 2026-08-31

Receipts are directly submitted (POSTED) with no draft state.
Void/undo preserves the row and tracks who/when/why so history is never lost.
"""

from alembic import op

revision = "c9d0e1f2a3b4"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add void/undo audit columns to receipts
    op.execute("""
        ALTER TABLE receipts
        ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'POSTED'
            CHECK (status IN ('POSTED', 'VOIDED')),
        ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES society_memberships(id),
        ADD COLUMN IF NOT EXISTS void_reason TEXT,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    """)
    op.execute("CREATE INDEX IF NOT EXISTS receipts_by_status ON receipts (status)")
    op.execute("CREATE INDEX IF NOT EXISTS receipts_by_society_status ON receipts (society_id, status)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS receipts_by_society_status")
    op.execute("DROP INDEX IF EXISTS receipts_by_status")
    op.execute("""
        ALTER TABLE receipts
        DROP COLUMN IF EXISTS updated_at,
        DROP COLUMN IF EXISTS void_reason,
        DROP COLUMN IF EXISTS voided_by,
        DROP COLUMN IF EXISTS voided_at,
        DROP COLUMN IF EXISTS status
    """)

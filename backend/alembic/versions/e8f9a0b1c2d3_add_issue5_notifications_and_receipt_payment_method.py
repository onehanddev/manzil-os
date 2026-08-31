"""issue 5: notifications + receipt payment_method CASH-only

Revision ID: e8f9a0b1c2d3
Revises: c9d0e1f2a3b4
Create Date: 2026-08-31

Adds:
  - receipts.payment_method TEXT DEFAULT 'CASH' CHECK (payment_method = 'CASH')
  - notifications table for in-app center (provider toggle test/live)
"""

from alembic import op

revision = "e8f9a0b1c2d3"
down_revision = "c9d0e1f2a3b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # payment_method fixed CASH – existing rows default to CASH
    op.execute("""
        ALTER TABLE receipts
        ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'CASH'
        CHECK (payment_method = 'CASH')
    """)
    # ensure default is CASH for future inserts without explicit value
    op.execute("ALTER TABLE receipts ALTER COLUMN payment_method SET DEFAULT 'CASH'")

    op.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            society_id UUID NOT NULL REFERENCES societies(id),
            receipt_id UUID REFERENCES receipts(id) ON DELETE SET NULL,
            payer_person_id UUID REFERENCES persons(id) ON DELETE SET NULL,
            flat_id UUID REFERENCES flats(id) ON DELETE SET NULL,
            channel TEXT NOT NULL DEFAULT 'WHATSAPP',
            provider_mode TEXT NOT NULL DEFAULT 'test'
                CHECK (provider_mode IN ('test', 'live')),
            status TEXT NOT NULL DEFAULT 'LOGGED'
                CHECK (status IN ('LOGGED', 'SENT', 'FAILED')),
            message TEXT,
            business_date DATE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS notifications_by_society ON notifications (society_id)")
    op.execute("CREATE INDEX IF NOT EXISTS notifications_by_receipt ON notifications (receipt_id)")
    op.execute("CREATE INDEX IF NOT EXISTS notifications_by_society_date ON notifications (society_id, business_date)")
    op.execute("CREATE INDEX IF NOT EXISTS notifications_by_created_at ON notifications (created_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS notifications CASCADE")
    op.execute("ALTER TABLE receipts DROP COLUMN IF EXISTS payment_method")

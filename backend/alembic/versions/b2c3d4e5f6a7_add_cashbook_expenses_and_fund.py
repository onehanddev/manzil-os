"""cashbook deep module: receipts.fund_id + expenses + cash_opening_balances

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-08-31
"""

from alembic import op

revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Receipts: fund tagging (nullable at DB level, required via API validation)
    op.execute("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS fund_id UUID REFERENCES funds(id)")
    op.execute("CREATE INDEX IF NOT EXISTS receipts_by_fund ON receipts (fund_id)")

    # Expenses — deep module's second entity
    op.execute("""
        CREATE TABLE IF NOT EXISTS expenses (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            society_id UUID NOT NULL REFERENCES societies(id),
            business_date DATE NOT NULL,
            amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
            fund_id UUID REFERENCES funds(id),
            category_id UUID NOT NULL REFERENCES expense_categories(id),
            vendor_id UUID REFERENCES vendors(id),
            narration TEXT,
            created_by UUID NOT NULL REFERENCES society_memberships(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            FOREIGN KEY (society_id, fund_id) REFERENCES funds (society_id, id),
            FOREIGN KEY (society_id, category_id) REFERENCES expense_categories (society_id, id),
            FOREIGN KEY (society_id, vendor_id) REFERENCES vendors (society_id, id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS expenses_by_society_business_date ON expenses (society_id, business_date)")
    op.execute("CREATE INDEX IF NOT EXISTS expenses_by_fund ON expenses (fund_id)")
    op.execute("CREATE INDEX IF NOT EXISTS expenses_by_category ON expenses (category_id)")

    # Society-level cash opening balances (PRD: cash_opening_balances)
    op.execute("""
        CREATE TABLE IF NOT EXISTS cash_opening_balances (
            society_id UUID NOT NULL REFERENCES societies(id),
            opening_date DATE NOT NULL,
            amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
            created_by UUID REFERENCES society_memberships(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (society_id, opening_date)
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS cash_opening_balances CASCADE")
    op.execute("DROP TABLE IF EXISTS expenses CASCADE")
    op.execute("DROP INDEX IF EXISTS receipts_by_fund")
    op.execute("ALTER TABLE receipts DROP COLUMN IF EXISTS fund_id")

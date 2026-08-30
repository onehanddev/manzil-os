"""add funds, vendors, expense_categories for Issue 4

Revision ID: a1b2c3d4e5f6
Revises: f6a7b8c9d0e1
Create Date: 2026-08-30
"""

from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "f6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE funds (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            society_id UUID NOT NULL REFERENCES societies(id),
            name TEXT NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (society_id, name),
            UNIQUE (society_id, id)
        )
    """)
    op.execute("""
        CREATE TABLE vendors (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            society_id UUID NOT NULL REFERENCES societies(id),
            name TEXT NOT NULL,
            contact_info TEXT,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (society_id, name),
            UNIQUE (society_id, id)
        )
    """)
    op.execute("""
        CREATE TABLE expense_categories (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            society_id UUID NOT NULL REFERENCES societies(id),
            name TEXT NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (society_id, name),
            UNIQUE (society_id, id)
        )
    """)
    # Seed required funds and common expense categories for pilot society
    op.execute("""
        INSERT INTO funds (id, society_id, name, is_active)
        VALUES
            ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000001', 'Main Fund', TRUE),
            ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000001', 'Sinking Fund', TRUE)
        ON CONFLICT (id) DO NOTHING
    """)
    op.execute("""
        INSERT INTO expense_categories (society_id, name)
        VALUES
            ('00000000-0000-0000-0000-000000000001', 'Electricity'),
            ('00000000-0000-0000-0000-000000000001', 'Salary'),
            ('00000000-0000-0000-0000-000000000001', 'Cleaning'),
            ('00000000-0000-0000-0000-000000000001', 'Lift'),
            ('00000000-0000-0000-0000-000000000001', 'Repair')
        ON CONFLICT (society_id, name) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS expense_categories CASCADE")
    op.execute("DROP TABLE IF EXISTS vendors CASCADE")
    op.execute("DROP TABLE IF EXISTS funds CASCADE")

"""initial trimmed schema

Revision ID: be8fc2f64365
Revises:
Create Date: 2026-08-30 16:47:09.406846

Trimmed Phase 1: opening_due - receipts model, no funds/charges/expenses.
Ported from backend/init.sql so `alembic upgrade head` is the canonical
way to provision a fresh DB (local dev, CI, and tests).
"""
from alembic import op
import sqlalchemy as sa

revision = 'be8fc2f64365'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")

    op.execute("""
        CREATE TABLE users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            username TEXT UNIQUE,
            auth_user_id UUID UNIQUE,
            mobile TEXT NOT NULL,
            display_name TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE societies (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            location TEXT,
            city TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE roles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            key TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL
        )
    """)

    op.execute("""
        CREATE TABLE society_memberships (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id),
            society_id UUID NOT NULL REFERENCES societies(id),
            joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            ended_at TIMESTAMPTZ,
            status TEXT NOT NULL DEFAULT 'ACTIVE'
                CHECK (status IN ('ACTIVE', 'ENDED', 'SUSPENDED')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK (ended_at IS NULL OR ended_at >= joined_at)
        )
    """)
    op.execute("CREATE INDEX society_memberships_by_society_user ON society_memberships (society_id, user_id)")

    op.execute("""
        CREATE TABLE membership_roles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            society_membership_id UUID NOT NULL REFERENCES society_memberships(id),
            role_id UUID NOT NULL REFERENCES roles(id),
            UNIQUE (society_membership_id, role_id)
        )
    """)

    op.execute("""
        CREATE TABLE flat_categories (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            society_id UUID NOT NULL REFERENCES societies(id),
            name TEXT NOT NULL,
            size_sq_ft NUMERIC(10, 2),
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK (size_sq_ft IS NULL OR size_sq_ft > 0),
            UNIQUE (society_id, name),
            UNIQUE (society_id, id)
        )
    """)

    op.execute("""
        CREATE TABLE flats (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            society_id UUID NOT NULL REFERENCES societies(id),
            flat_number TEXT NOT NULL,
            flat_category_id UUID NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            FOREIGN KEY (society_id, flat_category_id)
                REFERENCES flat_categories (society_id, id),
            UNIQUE (society_id, flat_number),
            UNIQUE (society_id, id)
        )
    """)

    op.execute("""
        CREATE TABLE persons (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            society_id UUID NOT NULL REFERENCES societies(id),
            name TEXT NOT NULL,
            mobile TEXT NOT NULL,
            email TEXT,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (society_id, id)
        )
    """)

    op.execute("""
        CREATE TABLE flat_occupants (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            flat_id UUID NOT NULL REFERENCES flats(id) ON DELETE CASCADE,
            person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK (role IN ('OWNER', 'TENANT')),
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            effective_from DATE,
            effective_until DATE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from),
            UNIQUE (flat_id, person_id, role)
        )
    """)
    op.execute("CREATE UNIQUE INDEX one_active_occupant_per_flat_role ON flat_occupants (flat_id, role) WHERE is_active")

    op.execute("""
        CREATE TABLE opening_dues (
            flat_id UUID PRIMARY KEY REFERENCES flats(id) ON DELETE CASCADE,
            amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE receipts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            society_id UUID NOT NULL REFERENCES societies(id),
            flat_id UUID NOT NULL,
            payer_person_id UUID REFERENCES persons(id),
            amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
            business_date DATE NOT NULL,
            type TEXT NOT NULL DEFAULT 'REGULAR'
                CHECK (type IN ('REGULAR', 'ARREARS', 'PART', 'ADVANCE')),
            narration TEXT,
            collected_by UUID NOT NULL REFERENCES society_memberships(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            FOREIGN KEY (society_id, flat_id) REFERENCES flats (society_id, id)
        )
    """)
    op.execute("CREATE INDEX receipts_by_flat_business_date ON receipts (flat_id, business_date)")
    op.execute("CREATE INDEX receipts_by_society_business_date ON receipts (society_id, business_date)")

    # Seed
    op.execute("""
        INSERT INTO roles (key, name) VALUES
            ('SOCIETY_ADMIN', 'Society Admin'),
            ('COLLECTOR', 'Collector')
        ON CONFLICT (key) DO NOTHING
    """)
    op.execute("""
        INSERT INTO societies (id, name, location, city)
        VALUES (
            '00000000-0000-0000-0000-000000000001',
            'Manzil Pilot Society',
            'Pilot Location',
            'Pune'
        )
        ON CONFLICT (id) DO NOTHING
    """)
    op.execute("""
        INSERT INTO flat_categories (id, society_id, name, is_active)
        VALUES
            ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', '1 BHK', TRUE),
            ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', '2 BHK', TRUE)
        ON CONFLICT (id) DO NOTHING
    """)
    # Production migrations intentionally stop at reference/bootstrap data.
    # Login users, memberships, and resident/contact records are created
    # explicitly per environment after deploy.


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS receipts CASCADE")
    op.execute("DROP TABLE IF EXISTS opening_dues CASCADE")
    op.execute("DROP TABLE IF EXISTS flat_occupants CASCADE")
    op.execute("DROP TABLE IF EXISTS persons CASCADE")
    op.execute("DROP TABLE IF EXISTS flats CASCADE")
    op.execute("DROP TABLE IF EXISTS flat_categories CASCADE")
    op.execute("DROP TABLE IF EXISTS membership_roles CASCADE")
    op.execute("DROP TABLE IF EXISTS society_memberships CASCADE")
    op.execute("DROP TABLE IF EXISTS roles CASCADE")
    op.execute("DROP TABLE IF EXISTS societies CASCADE")
    op.execute("DROP TABLE IF EXISTS users CASCADE")
    # extensions kept

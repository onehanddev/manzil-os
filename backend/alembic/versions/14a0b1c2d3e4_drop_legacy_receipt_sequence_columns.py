"""drop legacy receipt sequence columns

Revision ID: 14a0b1c2d3e4
Revises: 13a0b1c2d3e4
Create Date: 2026-08-31
"""

from alembic import op

revision = "14a0b1c2d3e4"
down_revision = "13a0b1c2d3e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'society_receipt_sequences'
                  AND column_name = 'fy_start_year'
            ) THEN
                UPDATE society_receipt_sequences
                SET fy_year = fy_start_year
                WHERE fy_year IS NULL OR fy_year <> fy_start_year;
            END IF;

            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'society_receipt_sequences'
                  AND column_name = 'next_seq'
            ) THEN
                UPDATE society_receipt_sequences
                SET next_number = GREATEST(next_number, next_seq);
            END IF;
        END $$;
        """
    )
    op.execute("ALTER TABLE society_receipt_sequences DROP COLUMN IF EXISTS fy_start_year")
    op.execute("ALTER TABLE society_receipt_sequences DROP COLUMN IF EXISTS fy_label")
    op.execute("ALTER TABLE society_receipt_sequences DROP COLUMN IF EXISTS next_seq")
    op.execute("ALTER TABLE society_receipt_sequences DROP COLUMN IF EXISTS created_at")


def downgrade() -> None:
    op.execute("ALTER TABLE society_receipt_sequences ADD COLUMN IF NOT EXISTS fy_start_year INTEGER")
    op.execute("UPDATE society_receipt_sequences SET fy_start_year = fy_year WHERE fy_start_year IS NULL")
    op.execute("ALTER TABLE society_receipt_sequences ALTER COLUMN fy_start_year SET NOT NULL")
    op.execute("ALTER TABLE society_receipt_sequences ADD COLUMN IF NOT EXISTS fy_label TEXT")
    op.execute(
        """
        UPDATE society_receipt_sequences
        SET fy_label = right(fy_start_year::TEXT, 2) || '-' || right((fy_start_year + 1)::TEXT, 2)
        WHERE fy_label IS NULL
        """
    )
    op.execute("ALTER TABLE society_receipt_sequences ALTER COLUMN fy_label SET NOT NULL")
    op.execute("ALTER TABLE society_receipt_sequences ADD COLUMN IF NOT EXISTS next_seq INTEGER NOT NULL DEFAULT 1")
    op.execute("UPDATE society_receipt_sequences SET next_seq = next_number")
    op.execute("ALTER TABLE society_receipt_sequences ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()")

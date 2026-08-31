"""issue 13: official receipt numbers

Revision ID: 13a0b1c2d3e4
Revises: 12d4e6a8c0f2
Create Date: 2026-08-31
"""

from alembic import op

revision = "13a0b1c2d3e4"
down_revision = "12d4e6a8c0f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS society_receipt_sequences (
            society_id UUID NOT NULL REFERENCES societies(id),
            fy_year INTEGER NOT NULL,
            next_number INTEGER NOT NULL DEFAULT 1,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (society_id, fy_year),
            CONSTRAINT society_receipt_sequences_next_number_check CHECK (next_number > 0)
        )
        """
    )
    op.execute("ALTER TABLE society_receipt_sequences ADD COLUMN IF NOT EXISTS fy_year INTEGER")
    op.execute(
        """
        UPDATE society_receipt_sequences
        SET fy_year = CASE
            WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4 THEN EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
            ELSE EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - 1
        END
        WHERE fy_year IS NULL
        """
    )
    op.execute("ALTER TABLE society_receipt_sequences ALTER COLUMN fy_year SET NOT NULL")
    op.execute("ALTER TABLE society_receipt_sequences ADD COLUMN IF NOT EXISTS next_number INTEGER NOT NULL DEFAULT 1")
    op.execute("ALTER TABLE society_receipt_sequences ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()")
    op.execute(
        """
        DO $$
        DECLARE
            existing_pk TEXT;
        BEGIN
            SELECT conname INTO existing_pk
            FROM pg_constraint
            WHERE conrelid = 'society_receipt_sequences'::regclass
              AND contype = 'p';

            IF existing_pk IS NOT NULL THEN
                EXECUTE format('ALTER TABLE society_receipt_sequences DROP CONSTRAINT %I', existing_pk);
            END IF;

            ALTER TABLE society_receipt_sequences
            ADD CONSTRAINT society_receipt_sequences_pkey PRIMARY KEY (society_id, fy_year);
        END $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'society_receipt_sequences_next_number_check'
                  AND conrelid = 'society_receipt_sequences'::regclass
            ) THEN
                ALTER TABLE society_receipt_sequences
                ADD CONSTRAINT society_receipt_sequences_next_number_check CHECK (next_number > 0);
            END IF;
        END $$;
        """
    )
    op.execute("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS receipt_number TEXT")
    op.execute("ALTER TABLE receipts ADD COLUMN IF NOT EXISTS public_pdf_token TEXT")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS receipts_receipt_number_key ON receipts (receipt_number)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS receipts_public_pdf_token_key ON receipts (public_pdf_token)")
    op.execute("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS provider_message_id TEXT")
    op.execute("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS failure_reason TEXT")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS receipts_receipt_number_key")
    op.execute("DROP INDEX IF EXISTS receipts_public_pdf_token_key")
    op.execute("ALTER TABLE notifications DROP COLUMN IF EXISTS failure_reason")
    op.execute("ALTER TABLE notifications DROP COLUMN IF EXISTS provider_message_id")
    op.execute("ALTER TABLE receipts DROP COLUMN IF EXISTS receipt_number")
    op.execute("ALTER TABLE receipts DROP COLUMN IF EXISTS public_pdf_token")
    op.execute("DROP TABLE IF EXISTS society_receipt_sequences")

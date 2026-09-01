"""issue 11: persisted cashbook report exports

Revision ID: f9a0b1c2d3e4
Revises: e8f9a0b1c2d3
Create Date: 2026-08-31
"""

from alembic import op

revision = "f9a0b1c2d3e4"
down_revision = "e8f9a0b1c2d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE report_runs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            society_id UUID NOT NULL REFERENCES societies(id),
            from_date DATE NOT NULL,
            to_date DATE NOT NULL,
            opening NUMERIC(12, 2) NOT NULL,
            total_receipts NUMERIC(12, 2) NOT NULL,
            total_expenses NUMERIC(12, 2) NOT NULL,
            closing NUMERIC(12, 2) NOT NULL,
            generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            generated_by UUID REFERENCES society_memberships(id),
            format TEXT NOT NULL,
            CONSTRAINT report_runs_date_range_check CHECK (from_date <= to_date),
            CONSTRAINT report_runs_society_range_key UNIQUE (society_id, from_date, to_date)
        )
        """
    )
    op.execute("CREATE INDEX report_runs_by_society_generated_at ON report_runs (society_id, generated_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE report_runs")

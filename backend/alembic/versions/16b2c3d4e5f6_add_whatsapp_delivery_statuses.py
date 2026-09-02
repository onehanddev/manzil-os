"""whatsapp delivery statuses DELIVERED/READ

Revision ID: 16b2c3d4e5f6
Revises: 15a0b1c2d3e4
Create Date: 2026-09-02

Expands notifications.status check to include DELIVERED/READ so the
webhook can persist Meta's async status callbacks (sent/delivered/read/failed).
Previously only LOGGED/SENT/FAILED – DELIVERED would violate the check.
"""

from alembic import op

revision = "16b2c3d4e5f6"
down_revision = "15a0b1c2d3e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_status_check")
    op.execute(
        """
        ALTER TABLE notifications
        ADD CONSTRAINT notifications_status_check
        CHECK (status IN ('LOGGED', 'SENT', 'DELIVERED', 'READ', 'FAILED'))
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS notifications_by_provider_message_id ON notifications (provider_message_id)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_status_check")
    op.execute(
        """
        ALTER TABLE notifications
        ADD CONSTRAINT notifications_status_check
        CHECK (status IN ('LOGGED', 'SENT', 'FAILED'))
        """
    )
    op.execute("DROP INDEX IF EXISTS notifications_by_provider_message_id")

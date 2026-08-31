"""issue 12: daily report push subscriptions

Revision ID: 12d4e6a8c0f2
Revises: f9a0b1c2d3e4
Create Date: 2026-08-31
"""

from alembic import op

revision = "12d4e6a8c0f2"
down_revision = "f9a0b1c2d3e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            endpoint TEXT NOT NULL,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT push_subscriptions_user_endpoint_key UNIQUE (user_id, endpoint)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS push_subscriptions_by_user ON push_subscriptions (user_id)")
    op.execute("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE")
    op.execute(
        "CREATE INDEX IF NOT EXISTS notifications_by_user_created_at ON notifications (user_id, created_at DESC)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE notifications DROP COLUMN user_id")
    op.execute("DROP TABLE push_subscriptions")

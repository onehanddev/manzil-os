"""add password_hash to users, seed admin password

Revision ID: c3d8e1f9a2b4
Revises: be8fc2f64365
Create Date: 2026-08-30
"""

from alembic import op

revision = "c3d8e1f9a2b4"
down_revision = "be8fc2f64365"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add password_hash column to users – keeps existing rows valid (nullable then set)
    op.execute(
        """
        ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
        """
    )
    # Seed admin password: hash for 'admin123' (bcrypt)
    # Hash generated via: passlib.hash.bcrypt.hash('admin123')
    # Use $2b$12$... precomputed to avoid needing python in SQL
    op.execute(
        """
        UPDATE users
        SET password_hash = '$2b$12$WC/DcUjE./zdAV8NqE23COrVngL6MSJkodalOSm8nWKhrWL5SYcEG'
        WHERE id = '00000000-0000-0000-0000-000000000201'
          AND (password_hash IS NULL OR password_hash = '');
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS password_hash")

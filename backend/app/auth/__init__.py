"""Auth vertical slice – Supabase only."""

from app.auth.supabase_client import is_supabase_configured, verify_supabase_jwt

__all__ = ["is_supabase_configured", "verify_supabase_jwt"]

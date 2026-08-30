"""Supabase Auth integration – thin wrapper with local fallback.

- When SUPABASE_URL (+ ANON or SERVICE key) is set, this module provides a real client.
- When not set (pytest, offline dev), functions no-op / raise gracefully and caller falls back to local JWT logic.
- Frontend already uses `supabase.auth.signInWithOtp` directly; backend's job is to *verify* the Supabase JWT and map `sub` -> `users.auth_user_id` -> roles.

Env vars (set in backend/.env or deployment):
  SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET
"""

import os
from typing import Optional


def _get_env(name: str) -> str | None:
    val = os.environ.get(name)
    if val:
        val = val.strip().strip('"').strip("'")
        if val:
            return val
    # also try reading backend/.env file directly (so get_database_url style fallback)
    try:
        import pathlib

        env_path = pathlib.Path(__file__).parent.parent.parent / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                line = line.strip()
                if line.startswith(name):
                    _, _, v = line.partition("=")
                    cand = v.strip().strip('"').strip("'")
                    if cand and not cand.startswith("#"):
                        return cand
    except Exception:
        pass
    return None


def get_supabase_url() -> str | None:
    return _get_env("SUPABASE_URL")


def get_supabase_jwt_secret() -> str | None:
    # Supabase JWT secret is used to verify JSW from supabase-js
    val = _get_env("SUPABASE_JWT_SECRET")
    if val:
        return val
    # fallback: SUPABASE_JWT_SECRET often same as legacy, try VITE_ variant
    return _get_env("VITE_SUPABASE_JWT_SECRET")


def is_supabase_configured() -> bool:
    return bool(get_supabase_url() and get_supabase_jwt_secret())


def get_supabase_client(service_role: bool = False):
    """Return supabase client or None if not configured.

    service_role=True uses SERVICE_ROLE_KEY (for admin.create_user). Otherwise anon.
    """
    try:
        from supabase import create_client
    except ImportError:
        return None
    url = get_supabase_url()
    if not url:
        return None
    key = _get_env("SUPABASE_SERVICE_ROLE_KEY") if service_role else _get_env("SUPABASE_ANON_KEY")
    # fallback: try anon if service not set
    if not key:
        key = _get_env("SUPABASE_ANON_KEY") or _get_env("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return None
    try:
        return create_client(url, key)
    except Exception:
        return None


def verify_supabase_jwt(token: str) -> dict | None:
    """Verify Supabase JWT using SUPABASE_JWT_SECRET via PyJWT."""
    secret = get_supabase_jwt_secret()
    if not secret:
        return None
    try:
        import jwt as pyjwt

        # Supabase JWTs are HS256 with aud=authenticated
        payload = pyjwt.decode(token, secret, algorithms=["HS256"], options={"verify_aud": False})
        return payload
    except Exception:
        return None


def supabase_create_user(mobile: str, password: str, display_name: str) -> str | None:
    """Create user in Supabase auth via service role, return auth_user_id or None."""
    client = get_supabase_client(service_role=True)
    if client is None:
        return None
    # Supabase phone auth: use phone + password; create via admin API with email fallback
    # Use phone as phone, and synthetic email to satisfy Supabase email requirement when needed.
    # Supabase allows phone-only if phone provider enabled; we try phone first.
    try:
        # Try phone-based creation – Supabase admin expects email or phone
        # Use synthetic email derived from mobile to keep compatibility with email/password flow
        # Frontend uses OTP phone, but for password pilot we use email trick.
        synthetic_email = f"{mobile.replace('+', '')}@manzil.local"
        resp = client.auth.admin.create_user(
            {
                "email": synthetic_email,
                "phone": mobile,
                "password": password,
                "email_confirm": True,
                "phone_confirm": True,
                "user_metadata": {"display_name": display_name, "mobile": mobile},
            }
        )
        user = getattr(resp, "user", None) or getattr(resp, "data", None)
        if user and getattr(user, "id", None):
            return str(user.id)
        # Some SDK versions return dict
        if isinstance(resp, dict) and resp.get("user"):
            return str(resp["user"].get("id"))
        return None
    except Exception:
        return None


def supabase_sign_in(mobile: str, password: str) -> dict | None:
    """Attempt Supabase sign-in with phone/password, return session dict or None."""
    client = get_supabase_client(service_role=False)
    if client is None:
        return None
    try:
        synthetic_email = f"{mobile.replace('+', '')}@manzil.local"
        # Try email+password first (works for synthetic email users)
        resp = client.auth.sign_in_with_password({"email": synthetic_email, "password": password})
        session = getattr(resp, "session", None) or (resp.get("session") if isinstance(resp, dict) else None)
        if session and getattr(session, "access_token", None):
            return {"access_token": session.access_token, "user": getattr(resp, "user", None)}
        # fallback: try phone+password (some projects allow)
        resp2 = client.auth.sign_in_with_password({"phone": mobile, "password": password})
        session2 = getattr(resp2, "session", None) or (resp2.get("session") if isinstance(resp2, dict) else None)
        if session2 and getattr(session2, "access_token", None):
            return {"access_token": session2.access_token, "user": getattr(resp2, "user", None)}
        return None
    except Exception:
        return None

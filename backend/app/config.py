"""Configuration loading – no prod secrets required for tests.

Reads DATABASE_URL / TEST_DATABASE_URL from environment or backend/.env,
strips Supabase `pgbouncer` query param, and normalises driver prefix to
`postgresql+psycopg://` for SQLAlchemy.

This module intentionally has no global side effects beyond the helper –
importing it never raises unless you call :func:`get_database_url` with no
URL configured.
"""

import os
import pathlib

_DEFAULT_ENV_PATHS = [
    pathlib.Path(__file__).parent.parent / ".env",
    pathlib.Path(__file__).parent.parent.parent / ".env",
]


def _read_env_file() -> str | None:
    for env_path in _DEFAULT_ENV_PATHS:
        if not env_path.exists():
            continue
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("DATABASE_URL"):
                _, _, val = line.partition("=")
                candidate = val.strip().strip('"').strip("'")
                if candidate and not candidate.startswith("#"):
                    return candidate
    return None


def _normalize(url: str) -> str:
    cleaned = url.replace("?pgbouncer=true", "").replace("&pgbouncer=true", "")
    # remove trailing ? or & left after stripping
    cleaned = cleaned.rstrip("?&")
    if cleaned.startswith("postgresql://"):
        cleaned = cleaned.replace("postgresql://", "postgresql+psycopg://", 1)
    elif cleaned.startswith("postgres://"):
        cleaned = cleaned.replace("postgres://", "postgresql+psycopg://", 1)
    return cleaned


def get_database_url() -> str:
    """Return the normalised SQLAlchemy database URL.

    Priority:
      1. $DATABASE_URL
      2. $TEST_DATABASE_URL
      3. backend/.env  (DATABASE_URL line)

    Raises RuntimeError only if none of the above is set – so tests that set
    TEST_DATABASE_URL never need production secrets.
    """
    url = (os.environ.get("DATABASE_URL") or "").strip().strip('"').strip("'")
    if not url:
        url = (os.environ.get("TEST_DATABASE_URL") or "").strip().strip('"').strip("'")
    if not url:
        url = _read_env_file() or ""
        if url:
            url = url.strip().strip('"').strip("'")
    if not url:
        raise RuntimeError("DATABASE_URL not set (and TEST_DATABASE_URL / backend/.env fallback empty)")
    return _normalize(url)


def get_job_secret() -> str:
    """Return the shared secret required by protected job endpoints."""
    return (os.environ.get("JOB_SECRET") or "").strip()


# Convenience re-export for code that previously did `from config import engine`
# – they can now do `from app.config import get_database_url`.
__all__ = ["get_database_url", "get_job_secret"]

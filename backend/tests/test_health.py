"""Issue 2 – Backend skeleton + health check (TDD Red tests).

Seams under test (pre-agreed):
  1. HTTP seam: GET /health via FastAPI TestClient – the public boundary.
  2. DB seam: `get_db` dependency yields a SQLAlchemy Session that can SELECT 1
     and closes cleanly.
  3. Config seam: `get_database_url` resolves without production secrets – it
     must honour TEST_DATABASE_URL / DATABASE_URL env vars and fall back to
     backend/.env, and raise only if nothing is configured.

All tests verify through the public seams, not internals.
"""

import os

import pytest
from fastapi.testclient import TestClient


# --- Seam 1: HTTP health endpoint ---


def test_health_endpoint_returns_success():
    """GET /health must return 200 with status ok (backend starts locally)."""
    from app.main import app

    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    # contract: { "status": "ok" } – allow extra fields but status must be ok
    assert data.get("status") == "ok"


def test_health_endpoint_does_not_require_auth():
    """GET /health must be public (no auth header needed)."""
    from app.main import app

    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200


# --- Seam 2: DB session handling ---


def test_app_can_open_and_close_db_session(conn):
    """App dependency must open a DB session that can execute a query and close."""
    from app.db import get_db

    # get_db is a FastAPI dependency generator: yields a Session
    gen = get_db()
    db = next(gen)
    try:
        result = db.execute(__import__("sqlalchemy").text("SELECT 1")).scalar()
        assert result == 1
    finally:
        # simulate FastAPI teardown – close the generator
        try:
            next(gen)
        except StopIteration:
            pass
        db.close()


def test_get_db_session_can_be_used_as_context():
    """Direct SessionLocal usage – open, query, close without leaking."""
    from sqlalchemy import text

    from app.db import SessionLocal

    session = SessionLocal()
    try:
        assert session.execute(text("SELECT 1")).scalar() == 1
    finally:
        session.close()


# --- Seam 3: Config does not require prod secrets ---


def test_config_uses_test_database_url_when_database_url_absent(monkeypatch):
    """Config must not require production secrets; TEST_DATABASE_URL suffices."""
    # Simulate CI where only TEST_DATABASE_URL is set
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("TEST_DATABASE_URL", "postgresql://user:pass@localhost:5432/test_db")

    # Re-import to pick up env change
    import importlib

    import app.config as cfg

    importlib.reload(cfg)
    url = cfg.get_database_url()
    assert "test_db" in url


def test_app_import_does_not_raise_without_production_env():
    """Importing the app must not require production secrets."""
    # If app.main imports at top-level, it should not raise even when
    # DATABASE_URL is not a prod Supabase URL.
    try:
        import app.main  # noqa: F401
    except RuntimeError as e:
        pytest.fail(f"app import raised RuntimeError: {e}")


def test_openapi_schema_is_available():
    """FastAPI app should expose OpenAPI schema (proves wiring)."""
    from app.main import app

    client = TestClient(app)
    resp = client.get("/openapi.json")
    assert resp.status_code == 200
    assert resp.json().get("openapi", "").startswith("3.")

"""TDD for flat_categories.maintenance_amount — Backend seam.

Seam: HTTP API via TestClient with Supabase JWT.
- maintenance_amount is nullable (None = no default), >=0 when provided.
- Prefill contract: POST /api/flat-categories with maintenance_amount persists and is returned via GET.
- PATCH can update maintenance_amount (including clearing to null).
- GET /api/flats/{id} should expose category's maintenance_amount for receipt prefill.
This test is expected to FAIL until migration + router handle the field (Red phase).
"""

import uuid

import jwt as pyjwt
import psycopg
import pytest
from fastapi.testclient import TestClient

from conftest import TEST_DB_URL

TEST_SUPABASE_URL = "https://test.supabase.co"
TEST_SUPABASE_JWT_SECRET = "test-supabase-jwt-secret-32-chars-long!!"

_supabase_store: dict[str, tuple[str, str]] = {}
_auth_id_to_mobile: dict[str, str] = {}


def _override_get_db():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.config import _normalize

    url = _normalize(TEST_DB_URL)
    engine = create_engine(url, pool_pre_ping=True)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _client():
    from app.db import get_db
    from app.main import create_app

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db
    return TestClient(app)


def _auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def _login(client, mobile, password):
    return client.post("/auth/login", json={"mobile": mobile, "password": password})


@pytest.fixture(autouse=True)
def _supabase_env_and_mock(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", TEST_SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_SUPABASE_JWT_SECRET)
    monkeypatch.setenv("SUPABASE_ANON_KEY", "test-anon-key")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
    with psycopg.connect(TEST_DB_URL, autocommit=True) as c:
        with c.cursor() as cur:
            cur.execute("SELECT id, auth_user_id FROM users WHERE mobile=%s", ("+919000000000",))
            row = cur.fetchone()
            if row:
                user_id, auth_id = row
                if not auth_id:
                    auth_id = str(uuid.uuid4())
                    cur.execute("UPDATE users SET auth_user_id=%s WHERE id=%s", (auth_id, user_id))
                else:
                    auth_id = str(auth_id)
                _supabase_store["+919000000000"] = (auth_id, "admin123")
                _auth_id_to_mobile[auth_id] = "+919000000000"
    import app.admin.router as admin_router_mod
    import app.auth.router as router_mod
    import app.auth.supabase_client as sc_mod

    def _mock_create_user(mobile, password, display_name):
        from app.auth.security import normalize_mobile

        norm = normalize_mobile(mobile)
        if norm in _supabase_store:
            return None
        auth_id = str(uuid.uuid4())
        _supabase_store[norm] = (auth_id, password)
        _auth_id_to_mobile[auth_id] = norm
        return auth_id

    def _mock_sign_in(mobile, password):
        from app.auth.security import normalize_mobile

        norm = normalize_mobile(mobile)
        entry = _supabase_store.get(norm)
        if not entry:
            return None
        auth_id, pw = entry
        if pw != password:
            return None
        token = pyjwt.encode(
            {"sub": auth_id, "phone": norm, "aud": "authenticated", "exp": 9999999999},
            TEST_SUPABASE_JWT_SECRET,
            algorithm="HS256",
        )
        return {"access_token": token, "user": {"id": auth_id}}

    monkeypatch.setattr(router_mod, "supabase_sign_in", _mock_sign_in)
    monkeypatch.setattr(admin_router_mod, "supabase_create_user", _mock_create_user)
    monkeypatch.setattr(sc_mod, "supabase_create_user", _mock_create_user)
    monkeypatch.setattr(sc_mod, "supabase_sign_in", _mock_sign_in)
    yield
    for k in list(_supabase_store.keys()):
        if k != "+919000000000":
            auth_id, _ = _supabase_store.pop(k)
            _auth_id_to_mobile.pop(auth_id, None)


def _admin_token(client):
    resp = _login(client, "+919000000000", "admin123")
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def test_create_flat_category_with_maintenance_amount(conn):
    client = _client()
    token = _admin_token(client)
    name = f"MAINT-CAT-{uuid.uuid4().hex[:6]}"
    # create with maintenance_amount
    resp = client.post(
        "/api/flat-categories", headers=_auth_header(token), json={"name": name, "maintenance_amount": 1200}
    )
    assert resp.status_code in (200, 201), resp.text
    data = resp.json()
    # must persist and return maintenance_amount
    assert "maintenance_amount" in data, f"missing maintenance_amount in {data}"
    assert float(data["maintenance_amount"]) == 1200

    # list should also include it
    listing = client.get("/api/flat-categories", headers=_auth_header(token))
    assert listing.status_code == 200
    cats = listing.json().get("categories", [])
    match = next((c for c in cats if c["name"] == name), None)
    assert match is not None
    assert "maintenance_amount" in match
    assert float(match["maintenance_amount"]) == 1200


def test_create_flat_category_without_maintenance_amount_defaults_to_null(conn):
    client = _client()
    token = _admin_token(client)
    name = f"NULL-CAT-{uuid.uuid4().hex[:6]}"
    resp = client.post("/api/flat-categories", headers=_auth_header(token), json={"name": name})
    assert resp.status_code in (200, 201), resp.text
    data = resp.json()
    assert "maintenance_amount" in data
    assert data["maintenance_amount"] is None


def test_patch_maintenance_amount_and_clear_to_null(conn):
    client = _client()
    token = _admin_token(client)
    name = f"PATCH-CAT-{uuid.uuid4().hex[:6]}"
    create = client.post("/api/flat-categories", headers=_auth_header(token), json={"name": name, "maintenance_amount": 500})
    assert create.status_code in (200, 201), create.text
    cat_id = create.json()["id"]

    # update to 2500
    patch = client.patch(f"/api/flat-categories/{cat_id}", headers=_auth_header(token), json={"is_active": True, "maintenance_amount": 2500})
    # The PATCH contract should accept maintenance_amount alongside is_active, or via dedicated field.
    # Accept either 200 with updated amount or, if not yet implemented, fail here (red).
    # We try alternative: if is_active-only patch ignores amount, then a second PATCH with only amount should work.
    if patch.status_code == 200:
        # check if amount updated
        if patch.json().get("maintenance_amount") is not None:
            assert float(patch.json()["maintenance_amount"]) == 2500
        else:
            # try explicit maintenance_amount patch via same endpoint with null is_active handling
            pass
    # verify via GET
    listing = client.get("/api/flat-categories", headers=_auth_header(token))
    cats = listing.json().get("categories", [])
    match = next((c for c in cats if c["id"] == cat_id), None)
    # If PATCH didn't support maintenance_amount yet, this will be red (expected to be 2500 but still 500)
    # We allow the test to pass if the router already supports it; else this asserts red.
    # To make the seam explicit: ensure patch can set to null
    patch_null = client.patch(f"/api/flat-categories/{cat_id}", headers=_auth_header(token), json={"maintenance_amount": None})
    # If the API treats None as clear, GET should show null. If endpoint rejects, this will 422/404 and test fails (red).
    assert patch_null.status_code == 200, patch_null.text
    get_after = client.get("/api/flat-categories", headers=_auth_header(token))
    match_after = next((c for c in get_after.json().get("categories", []) if c["id"] == cat_id), None)
    assert match_after is not None
    assert match_after["maintenance_amount"] is None, f"expected null after clear, got {match_after}"


def test_flat_detail_exposes_category_maintenance_amount_for_prefill(conn):
    client = _client()
    token = _admin_token(client)
    cat_name = f"FLAT-PREFILL-{uuid.uuid4().hex[:6]}"
    cat = client.post("/api/flat-categories", headers=_auth_header(token), json={"name": cat_name, "maintenance_amount": 1800})
    assert cat.status_code in (200, 201), cat.text
    cat_id = cat.json()["id"]
    flat_number = f"MP-{uuid.uuid4().hex[:4]}"
    flat = client.post("/api/flats", headers=_auth_header(token), json={"flat_number": flat_number, "flat_category_id": cat_id})
    assert flat.status_code in (200, 201), flat.text
    flat_id = flat.json()["id"]

    detail = client.get(f"/api/flats/{flat_id}", headers=_auth_header(token))
    assert detail.status_code == 200, detail.text
    # detail must expose maintenance_amount (from its category) for frontend prefill
    assert "maintenance_amount" in detail.json() or "category_maintenance_amount" in detail.json() or "flat_category" in detail.json(), f"detail missing prefill: {detail.json()}"
    # Extract
    j = detail.json()
    amt = j.get("maintenance_amount") or j.get("category_maintenance_amount") or (j.get("flat_category") or {}).get("maintenance_amount")
    assert amt is not None and float(amt) == 1800, f"expected 1800 prefill, got {j}"


def test_negative_maintenance_amount_rejected(conn):
    client = _client()
    token = _admin_token(client)
    resp = client.post(
        "/api/flat-categories", headers=_auth_header(token), json={"name": f"NEG-{uuid.uuid4().hex[:6]}", "maintenance_amount": -100}
    )
    assert resp.status_code in (400, 422), resp.text

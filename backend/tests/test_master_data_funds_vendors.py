"""Issue 4 – Funds / Vendors / Expense Categories (TDD, red first).

Seams: HTTP API via TestClient with Supabase JWT. Admin-only, unauthenticated -> 401, collector -> 403.
"""

import os
import uuid

import jwt as pyjwt  # noqa: F401 - imported for parity with existing tests
import psycopg
import pytest
from fastapi.testclient import TestClient

from conftest import TEST_DB_URL
from tests.test_master_data import _admin_token, _auth_header, _client, _collector_token

TEST_SUPABASE_URL = "https://test.supabase.co"
TEST_SUPABASE_JWT_SECRET = "test-supabase-jwt-secret-32-chars-long!!"

_supabase_store: dict[str, tuple[str, str]] = {}
_auth_id_to_mobile: dict[str, str] = {}


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
            else:
                cur.execute("SELECT id FROM societies LIMIT 1")
                society_row = cur.fetchone()
                assert society_row is not None
                society_id = society_row[0]
                user_id = str(uuid.uuid4())
                auth_id = str(uuid.uuid4())
                cur.execute(
                    "INSERT INTO users (id, mobile, display_name, auth_user_id) VALUES (%s,%s,%s,%s)",
                    (user_id, "+919000000000", "Pilot Admin", auth_id),
                )
                mem_id = str(uuid.uuid4())
                cur.execute(
                    "INSERT INTO society_memberships (id, user_id, society_id, status) VALUES (%s,%s,%s,'ACTIVE')",
                    (mem_id, user_id, society_id),
                )
                cur.execute("SELECT id FROM roles WHERE key='SOCIETY_ADMIN'")
                role_id = cur.fetchone()[0]
                cur.execute(
                    "INSERT INTO membership_roles (society_membership_id, role_id) VALUES (%s,%s)", (mem_id, role_id)
                )
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
    with psycopg.connect(TEST_DB_URL, autocommit=True) as c:
        with c.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE mobile IN ('+919000000100', '+919000000101', '+919000000999')")
            rows = cur.fetchall()
            for (uid,) in rows:
                cur.execute(
                    "DELETE FROM membership_roles WHERE society_membership_id IN (SELECT id FROM society_memberships WHERE user_id=%s)",
                    (uid,),
                )
                cur.execute("DELETE FROM society_memberships WHERE user_id=%s", (uid,))
                cur.execute("DELETE FROM users WHERE id=%s", (uid,))


def test_admin_can_create_and_list_funds():
    """AC6: Admin can create and list funds."""
    client = _client()
    token = _admin_token(client)
    name = f"FUND-{uuid.uuid4().hex[:6]}"
    create = client.post("/api/funds", headers=_auth_header(token), json={"name": name})
    assert create.status_code in (200, 201), create.text
    assert create.json().get("id")
    listing = client.get("/api/funds", headers=_auth_header(token))
    assert listing.status_code == 200, listing.text
    assert name in listing.text


def test_fund_name_unique_per_society():
    client = _client()
    token = _admin_token(client)
    name = f"UNIQF-{uuid.uuid4().hex[:6]}"
    r1 = client.post("/api/funds", headers=_auth_header(token), json={"name": name})
    assert r1.status_code in (200, 201), r1.text
    r2 = client.post("/api/funds", headers=_auth_header(token), json={"name": name})
    assert r2.status_code == 409, r2.text


def test_collector_cannot_create_fund():
    client = _client()
    admin_token = _admin_token(client)
    collector_token = _collector_token(client, admin_token)
    resp = client.post("/api/funds", headers=_auth_header(collector_token), json={"name": "SHOULD-FAIL"})
    assert resp.status_code == 403, resp.text


def test_admin_can_create_and_list_vendors():
    """AC7: Admin can create and list vendors/payees."""
    client = _client()
    token = _admin_token(client)
    name = f"VENDOR-{uuid.uuid4().hex[:6]}"
    create = client.post("/api/vendors", headers=_auth_header(token), json={"name": name})
    assert create.status_code in (200, 201), create.text
    assert create.json().get("id")
    listing = client.get("/api/vendors", headers=_auth_header(token))
    assert listing.status_code == 200, listing.text
    assert name in listing.text


def test_vendor_name_unique_per_society():
    client = _client()
    token = _admin_token(client)
    name = f"UNIQV-{uuid.uuid4().hex[:6]}"
    r1 = client.post("/api/vendors", headers=_auth_header(token), json={"name": name})
    assert r1.status_code in (200, 201), r1.text
    r2 = client.post("/api/vendors", headers=_auth_header(token), json={"name": name})
    assert r2.status_code == 409, r2.text


def test_collector_cannot_create_vendor():
    client = _client()
    admin_token = _admin_token(client)
    collector_token = _collector_token(client, admin_token)
    resp = client.post("/api/vendors", headers=_auth_header(collector_token), json={"name": "SHOULD-FAIL"})
    assert resp.status_code == 403, resp.text


def test_admin_can_create_and_list_expense_categories():
    """AC8: Admin can create and list expense categories."""
    client = _client()
    token = _admin_token(client)
    name = f"EXPCAT-{uuid.uuid4().hex[:6]}"
    create = client.post("/api/expense-categories", headers=_auth_header(token), json={"name": name})
    assert create.status_code in (200, 201), create.text
    assert create.json().get("id")
    listing = client.get("/api/expense-categories", headers=_auth_header(token))
    assert listing.status_code == 200, listing.text
    assert name in listing.text


def test_expense_category_name_unique_per_society():
    client = _client()
    token = _admin_token(client)
    name = f"UNIQE-{uuid.uuid4().hex[:6]}"
    r1 = client.post("/api/expense-categories", headers=_auth_header(token), json={"name": name})
    assert r1.status_code in (200, 201), r1.text
    r2 = client.post("/api/expense-categories", headers=_auth_header(token), json={"name": name})
    assert r2.status_code == 409, r2.text


def test_collector_cannot_create_expense_category():
    client = _client()
    admin_token = _admin_token(client)
    collector_token = _collector_token(client, admin_token)
    resp = client.post(
        "/api/expense-categories", headers=_auth_header(collector_token), json={"name": "SHOULD-FAIL"}
    )
    assert resp.status_code == 403, resp.text


def test_unauthenticated_funds_vendors_expense_rejected():
    client = _client()
    assert client.get("/api/funds").status_code == 401
    assert client.get("/api/vendors").status_code == 401
    assert client.get("/api/expense-categories").status_code == 401


def test_seed_funds_exist():
    """Main Fund and Sinking Fund seeded via migration."""
    client = _client()
    token = _admin_token(client)
    listing = client.get("/api/funds", headers=_auth_header(token))
    assert listing.status_code == 200, listing.text
    text = listing.text
    assert "Main Fund" in text or "MAIN" in text.upper()
    assert "Sinking Fund" in text or "SINKING" in text.upper()

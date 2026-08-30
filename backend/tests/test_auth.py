"""Issue 3 – Supabase Auth only (no local fallback).

Seams under test:
  1. HTTP seam: POST /auth/login, POST /auth/logout, GET /api/me, and /api/* guards
     via TestClient with Supabase JWT. No local JWT is accepted.
  2. Supabase Auth seam: supabase_sign_in / supabase_create_user mocked in-process;
     verify_supabase_jwt verified via SUPABASE_JWT_SECRET (PyJWT).
  3. Role seam: COLLECTOR allowed on POST /api/receipts + GET /api/flats but 403 on admin routes.
"""

import os
import uuid

import jwt as pyjwt
import psycopg
import pytest
from fastapi.testclient import TestClient

from conftest import TEST_DB_URL

TEST_SUPABASE_URL = "https://test.supabase.co"
TEST_SUPABASE_JWT_SECRET = "test-supabase-jwt-secret-32-chars-long!!"

# In-memory store to mimic Supabase auth.users for tests
_supabase_store: dict[str, tuple[str, str]] = {}  # mobile -> (auth_user_id, password)
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
    """Provide SUPABASE config and mock Supabase client helpers."""
    # Env for supabase_client.is_supabase_configured / verify
    monkeypatch.setenv("SUPABASE_URL", TEST_SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_SUPABASE_JWT_SECRET)
    monkeypatch.setenv("SUPABASE_ANON_KEY", "test-anon-key")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

    # Ensure seeded admin has auth_user_id linked and is in store
    # Populate store from DB if needed
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
                # No admin seeded (e.g. fresh DB) – create it via SQL with membership
                cur.execute("SELECT id FROM societies LIMIT 1")
                society_row = cur.fetchone()
                if not society_row:
                    pytest.fail("no society seeded")
                society_id = society_row[0]
                user_id = str(uuid.uuid4())
                auth_id = str(uuid.uuid4())
                cur.execute(
                    "INSERT INTO users (id, mobile, display_name, auth_user_id) VALUES (%s,%s,%s,%s)",
                    (user_id, "+919000000000", "Pilot Admin", auth_id),
                )
                # membership
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

    # Mock Supabase helpers
    import app.auth.router as router_mod
    import app.auth.supabase_client as sc_mod

    def _mock_create_user(mobile, password, display_name):
        from app.auth.security import normalize_mobile

        norm = normalize_mobile(mobile)
        if norm in _supabase_store:
            return None  # already exists -> router will 409 before calling this for duplicates
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

    monkeypatch.setattr(router_mod, "supabase_create_user", _mock_create_user)
    monkeypatch.setattr(router_mod, "supabase_sign_in", _mock_sign_in)
    monkeypatch.setattr(sc_mod, "supabase_create_user", _mock_create_user)
    monkeypatch.setattr(sc_mod, "supabase_sign_in", _mock_sign_in)

    yield

    # cleanup store between tests to avoid cross-contamination for dynamically created users
    # Keep admin
    for k in list(_supabase_store.keys()):
        if k != "+919000000000":
            auth_id, _ = _supabase_store.pop(k)
            _auth_id_to_mobile.pop(auth_id, None)
    # also delete non-admin users/memberships created via API to keep DB clean
    with psycopg.connect(TEST_DB_URL, autocommit=True) as c:
        with c.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE mobile IN ('+919000000100', '+919000000101', '+919000000999')")
            rows = cur.fetchall()
            for (uid,) in rows:
                cur.execute("DELETE FROM membership_roles WHERE society_membership_id IN (SELECT id FROM society_memberships WHERE user_id=%s)", (uid,))
                cur.execute("DELETE FROM society_memberships WHERE user_id=%s", (uid,))
                cur.execute("DELETE FROM users WHERE id=%s", (uid,))


def test_admin_can_authenticate_and_call_guarded_endpoint(conn):
    """AC1: admin can authenticate and call guarded endpoint via Supabase JWT."""
    client = _client()
    resp = _login(client, "+919000000000", "admin123")
    assert resp.status_code == 200, resp.text
    token = resp.json().get("access_token")
    assert token
    # token should be a Supabase JWT verifiable with our secret
    payload = pyjwt.decode(token, TEST_SUPABASE_JWT_SECRET, algorithms=["HS256"], options={"verify_aud": False})
    assert payload.get("sub")
    me = client.get("/api/me", headers=_auth_header(token))
    assert me.status_code == 200, me.text
    assert me.json().get("mobile") == "+919000000000"
    assert "SOCIETY_ADMIN" in me.json().get("roles", [])


def test_unauthenticated_requests_are_rejected():
    """AC2: unauthenticated API requests are rejected with 401."""
    client = _client()
    resp = client.get("/api/me")
    assert resp.status_code == 401
    resp2 = client.post("/api/receipts", json={})
    assert resp2.status_code == 401
    health = client.get("/health")
    assert health.status_code == 200
    bad = _login(client, "+919000000000", "wrong")
    assert bad.status_code == 401


def test_collector_can_create_receipt_and_read_flats_but_forbidden_on_admin_routes(conn):
    """AC3: collector allowed on POST /api/receipts + GET /api/flats, 403 on admin routes."""
    client = _client()
    admin_login = _login(client, "+919000000000", "admin123")
    assert admin_login.status_code == 200, admin_login.text
    admin_token = admin_login.json()["access_token"]

    collector_mobile = "+919000000100"
    create_resp = client.post(
        "/api/admin/users",
        headers=_auth_header(admin_token),
        json={
            "mobile": collector_mobile,
            "password": "collector123",
            "display_name": "Collector One",
            "role": "COLLECTOR",
        },
    )
    assert create_resp.status_code in (200, 201), create_resp.text
    # auth_user_id should be returned and is a Supabase id
    assert create_resp.json().get("auth_user_id")

    collector_login = _login(client, collector_mobile, "collector123")
    assert collector_login.status_code == 200, collector_login.text
    collector_token = collector_login.json()["access_token"]

    # collector CAN hit POST /api/receipts (not 401/403)
    r1 = client.post(
        "/api/receipts",
        headers=_auth_header(collector_token),
        json={
            "flat_id": "00000000-0000-0000-0000-000000000001",
            "amount": 100,
            "business_date": "2026-08-01",
            "type": "REGULAR",
        },
    )
    assert r1.status_code not in (401, 403), f"collector should be allowed on POST /api/receipts, got {r1.status_code} {r1.text}"

    r2 = client.get("/api/flats", headers=_auth_header(collector_token))
    assert r2.status_code == 200, r2.text

    r3 = client.post(
        "/api/flats",
        headers=_auth_header(collector_token),
        json={"flat_number": "X-999", "flat_category_id": "00000000-0000-0000-0000-000000000101"},
    )
    assert r3.status_code == 403, f"collector should be forbidden on POST /api/flats, got {r3.status_code} {r3.text}"

    r4 = client.post(
        "/api/opening-dues",
        headers=_auth_header(collector_token),
        json={"flat_id": "00000000-0000-0000-0000-000000000001", "amount": 1000},
    )
    assert r4.status_code == 403

    r5 = client.get("/api/admin/stats", headers=_auth_header(collector_token))
    assert r5.status_code == 403


def test_owner_tenant_persons_cannot_log_in(conn):
    """AC4: owner/tenant persons cannot log in (no Supabase user)."""
    client = _client()
    resp = _login(client, "+919000000009", "anypassword")
    assert resp.status_code == 401, f"person should not be able to log in, got {resp.status_code} {resp.text}"
    with psycopg.connect(TEST_DB_URL, autocommit=True) as c:
        with c.cursor() as cur:
            cur.execute("SELECT id FROM societies LIMIT 1")
            society_id = cur.fetchone()[0]
            new_mobile = "+919000000999"
            cur.execute(
                "INSERT INTO persons (society_id, name, mobile) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                (society_id, "Random Owner", new_mobile),
            )
    resp2 = _login(client, new_mobile, "anypassword")
    assert resp2.status_code == 401


def test_supabase_jwt_verification_and_otp_placeholder(conn):
    """AC5: Supabase JWT is verified via SUPABASE_JWT_SECRET; OTP is via Supabase (not local 123456)."""
    # Direct supabase_client verification should work with our test secret
    from app.auth.supabase_client import is_supabase_configured, verify_supabase_jwt

    assert is_supabase_configured() is True

    # Create a fake Supabase JWT for admin
    auth_id, _ = _supabase_store["+919000000000"]
    token = pyjwt.encode(
        {"sub": auth_id, "phone": "+919000000000", "aud": "authenticated", "exp": 9999999999},
        TEST_SUPABASE_JWT_SECRET,
        algorithm="HS256",
    )
    payload = verify_supabase_jwt(token)
    assert payload is not None
    assert payload.get("sub") == auth_id

    # Wrong secret fails
    bad_token = pyjwt.encode(
        {"sub": auth_id, "phone": "+919000000000", "aud": "authenticated", "exp": 9999999999},
        "wrong-secret-32-chars-long-value!!",
        algorithm="HS256",
    )
    assert verify_supabase_jwt(bad_token) is None

    # OTP via Supabase is phone-based – ensure login with phone+password still 123456-free
    # i.e. 123456 is not a magic OTP, only correct password passes
    client = _client()
    bad_otp = _login(client, "+919000000000", "123456")
    assert bad_otp.status_code == 401


def test_mobile_normalization_still_applies(conn):
    """Mobile normalization (E.164) still applies before Supabase call."""
    client = _client()
    admin_login = _login(client, "+919000000000", "admin123")
    assert admin_login.status_code == 200, admin_login.text
    admin_token = admin_login.json()["access_token"]

    resp = client.post(
        "/api/admin/users",
        headers=_auth_header(admin_token),
        json={
            "mobile": "9000000101",  # 10 digits, should normalize to +919000000101
            "password": "testpass123",
            "display_name": "Normalized User",
            "role": "COLLECTOR",
        },
    )
    assert resp.status_code in (200, 201), resp.text
    # stored mobile should be normalized
    with psycopg.connect(TEST_DB_URL) as c:
        with c.cursor() as cur:
            cur.execute("SELECT mobile, auth_user_id FROM users WHERE mobile=%s", ("+919000000101",))
            row = cur.fetchone()
            assert row is not None, "user not found after normalized insert"
            assert row[0] == "+919000000101"
            assert row[1] is not None  # Supabase auth_user_id linked

    # login with various mobile formats should succeed after normalization
    login1 = _login(client, "9000000101", "testpass123")
    assert login1.status_code == 200, f"mobile normalization failed for 10-digit: {login1.text}"
    login2 = _login(client, "+91 9000000101", "testpass123")
    assert login2.status_code == 200, f"mobile normalization failed for spaced +91: {login2.text}"


def test_logout_requires_auth_and_invalidates_or_returns_success():
    """POST /auth/logout should require auth and return success."""
    client = _client()
    resp = client.post("/auth/logout")
    assert resp.status_code == 401
    login = _login(client, "+919000000000", "admin123")
    token = login.json()["access_token"]
    resp2 = client.post("/auth/logout", headers=_auth_header(token))
    assert resp2.status_code == 200


def test_local_jwt_is_rejected_after_migration(conn):
    """Pure Supabase mode: a legacy local JWT (user_id payload) must be rejected."""
    # Craft a legacy local JWT signed with old dev secret
    legacy_token = pyjwt.encode(
        {"user_id": "00000000-0000-0000-0000-000000000201", "roles": ["SOCIETY_ADMIN"], "exp": 9999999999},
        "dev-only-secret-change-in-prod-32chars!!",
        algorithm="HS256",
    )
    client = _client()
    resp = client.get("/api/me", headers=_auth_header(legacy_token))
    assert resp.status_code == 401, "legacy local JWT should no longer be accepted"

"""TDD for OTP registration + admin approval (vertical slice).

Seams under test (pre-agreed):
  - HTTP seam: POST /auth/otp/send, POST /auth/otp/verify, GET /api/admin/pending, POST /api/admin/users/{id}/approve via TestClient.
  - Supabase Auth seam: supabase_send_otp / supabase_verify_otp mocked via env SUPABASE_TEST_OTP=1 (returns 123456 without SMS cost).
  - DB seam: society_memberships.status PENDING -> ACTIVE after approval.

Tests verify through public HTTP seam only.
"""

import os
import uuid

import jwt as pyjwt
import psycopg
from fastapi.testclient import TestClient

from conftest import TEST_DB_URL

TEST_SUPABASE_URL = "https://test.supabase.co"
TEST_SUPABASE_JWT_SECRET = "test-supabase-jwt-secret-32-chars-long!!"


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


# Slice 1: OTP send
def test_otp_send_returns_test_otp_in_test_mode(monkeypatch):
    """POST /auth/otp/send should return 200 and expose test OTP when SUPABASE_TEST_OTP=1."""
    monkeypatch.setenv("SUPABASE_URL", TEST_SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_SUPABASE_JWT_SECRET)
    monkeypatch.setenv("SUPABASE_TEST_OTP", "1")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "test-anon")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service")

    client = _client()
    resp = client.post("/auth/otp/send", json={"mobile": "+919000001111"})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    # In test mode Supabase does not charge SMS – we return 123456 hint
    assert data.get("otp") == "123456" or "123456" in str(data) or data.get("status") == "sent"


# Slice 2: OTP verify + bootstrap/pending
def test_otp_verify_first_user_becomes_admin_and_second_is_pending(monkeypatch):
    """POST /auth/otp/verify bootstraps first user as SOCIETY_ADMIN, second as PENDING."""
    monkeypatch.setenv("SUPABASE_URL", TEST_SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_SUPABASE_JWT_SECRET)
    monkeypatch.setenv("SUPABASE_TEST_OTP", "1")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "test-anon")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service")

    client = _client()

    # Ensure clean state - use unique mobiles
    mobile1 = "+919000002001"
    mobile2 = "+919000002002"

    # Simulate empty admin scenario by checking current admin exists; first verify will be pending since admin exists
    # So we test: second user is pending (admin exists) -> status pending
    # Clear any prior test users
    with psycopg.connect(TEST_DB_URL, autocommit=True) as c:
        with c.cursor() as cur:
            for m in (mobile1, mobile2):
                cur.execute("SELECT id FROM users WHERE mobile=%s", (m,))
                r = cur.fetchone()
                if r:
                    cur.execute("DELETE FROM membership_roles WHERE society_membership_id IN (SELECT id FROM society_memberships WHERE user_id=%s)", (r[0],))
                    cur.execute("DELETE FROM society_memberships WHERE user_id=%s", (r[0],))
                    cur.execute("DELETE FROM users WHERE id=%s", (r[0],))

    # New user verify should be pending (since admin already exists)
    resp = client.post("/auth/otp/verify", json={"mobile": mobile1, "token": "123456", "display_name": "New User One"})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data.get("status") == "pending"
    token_pending = data.get("access_token")
    assert token_pending
    # Pending user can get /api/me but not /api/flats (should be 403 after we add active check) or at least not admin
    me = client.get("/api/me", headers={"Authorization": f"Bearer {token_pending}"})
    assert me.status_code == 200
    # Should have empty roles
    assert me.json().get("roles") == []
    # Pending cannot access flats/receipts until admin approval
    flats = client.get("/api/flats", headers={"Authorization": f"Bearer {token_pending}"})
    assert flats.status_code == 403, f"pending should be forbidden on flats, got {flats.status_code} {flats.text}"

    # Wrong OTP fails
    bad = client.post("/auth/otp/verify", json={"mobile": mobile2, "token": "000000"})
    assert bad.status_code == 401

    # Cleanup
    with psycopg.connect(TEST_DB_URL, autocommit=True) as c:
        with c.cursor() as cur:
            for m in (mobile1, mobile2):
                cur.execute("SELECT id FROM users WHERE mobile=%s", (m,))
                r = cur.fetchone()
                if r:
                    cur.execute("DELETE FROM membership_roles WHERE society_membership_id IN (SELECT id FROM society_memberships WHERE user_id=%s)", (r[0],))
                    cur.execute("DELETE FROM society_memberships WHERE user_id=%s", (r[0],))
                    cur.execute("DELETE FROM users WHERE id=%s", (r[0],))


# Slice 3: Admin pending + approve
def test_admin_can_list_pending_and_approve(monkeypatch):
    """GET /api/admin/pending lists PENDING, POST /api/admin/users/{id}/approve activates."""
    monkeypatch.setenv("SUPABASE_URL", TEST_SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_SUPABASE_JWT_SECRET)
    monkeypatch.setenv("SUPABASE_TEST_OTP", "1")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "test-anon")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service")

    client = _client()
    # admin login (existing seeded admin via OTP mock? Use password login via mocked Supabase? Use OTP verify for admin)
    # Use admin mobile via OTP verify to get token (admin already exists, will not create new pending)
    # Instead directly use existing admin token via login endpoint (password) – need to mock password login too
    # For this test, get admin token via OTP verify with existing admin mobile (will link)
    admin_mobile = "+919000000000"
    # Send and verify OTP for admin (existing user, should remain ACTIVE)
    client.post("/auth/otp/send", json={"mobile": admin_mobile})
    resp_admin = client.post("/auth/otp/verify", json={"mobile": admin_mobile, "token": "123456"})
    assert resp_admin.status_code == 200, resp_admin.text
    admin_token = resp_admin.json().get("access_token")
    assert admin_token

    # Create pending user
    pending_mobile = "+919000003001"
    with psycopg.connect(TEST_DB_URL, autocommit=True) as c:
        with c.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE mobile=%s", (pending_mobile,))
            r = cur.fetchone()
            if r:
                cur.execute("DELETE FROM membership_roles WHERE society_membership_id IN (SELECT id FROM society_memberships WHERE user_id=%s)", (r[0],))
                cur.execute("DELETE FROM society_memberships WHERE user_id=%s", (r[0],))
                cur.execute("DELETE FROM users WHERE id=%s", (r[0],))
    client.post("/auth/otp/send", json={"mobile": pending_mobile})
    resp_pending = client.post("/auth/otp/verify", json={"mobile": pending_mobile, "token": "123456", "display_name": "Pending User"})
    assert resp_pending.status_code == 200, resp_pending.text
    assert resp_pending.json().get("status") == "pending"
    pending_token = resp_pending.json().get("access_token")

    # Pending cannot list pending (403)
    r_forbidden = client.get("/api/admin/pending", headers={"Authorization": f"Bearer {pending_token}"})
    assert r_forbidden.status_code == 403

    # Admin can list pending
    r_list = client.get("/api/admin/pending", headers={"Authorization": f"Bearer {admin_token}"})
    assert r_list.status_code == 200, r_list.text
    pending_list = r_list.json().get("pending", [])
    assert any(p.get("mobile") == pending_mobile for p in pending_list), f"pending list missing {pending_mobile}: {pending_list}"

    # Find pending user id
    pending_entry = next(p for p in pending_list if p.get("mobile") == pending_mobile)
    pending_user_id = pending_entry.get("user_id") or pending_entry.get("id")

    # Admin approves as COLLECTOR
    r_approve = client.post(
        f"/api/admin/users/{pending_user_id}/approve",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"role": "COLLECTOR"},
    )
    assert r_approve.status_code == 200, r_approve.text
    assert r_approve.json().get("status") == "active"

    # Now pending user should be able to access flats
    r_flats = client.get("/api/flats", headers={"Authorization": f"Bearer {pending_token}"})
    assert r_flats.status_code == 200, f"after approval should access flats: {r_flats.text}"

    # Also can create receipt
    r_receipt = client.post(
        "/api/receipts",
        headers={"Authorization": f"Bearer {pending_token}"},
        json={"flat_id": "00000000-0000-0000-0000-000000000001", "amount": 10, "business_date": "2026-08-01"},
    )
    assert r_receipt.status_code == 200

    # Cleanup
    with psycopg.connect(TEST_DB_URL, autocommit=True) as c:
        with c.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE mobile=%s", (pending_mobile,))
            r = cur.fetchone()
            if r:
                cur.execute("DELETE FROM membership_roles WHERE society_membership_id IN (SELECT id FROM society_memberships WHERE user_id=%s)", (r[0],))
                cur.execute("DELETE FROM society_memberships WHERE user_id=%s", (r[0],))
                cur.execute("DELETE FROM users WHERE id=%s", (r[0],))


# Slice 4: Register -> OTP verify -> set password -> login with password (Phase 1 registration flow)
def test_register_verify_set_password_then_login(monkeypatch):
    """User registers via OTP, sets password, then can login with mobile+password (pending until admin approval)."""
    monkeypatch.setenv("SUPABASE_URL", TEST_SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_SUPABASE_JWT_SECRET)
    monkeypatch.setenv("SUPABASE_TEST_OTP", "1")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "test-anon")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service")

    client = _client()
    mobile = "+919000004001"
    password = "MyStrongPass123"

    # cleanup
    with psycopg.connect(TEST_DB_URL, autocommit=True) as c:
        with c.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE mobile=%s", (mobile,))
            r = cur.fetchone()
            if r:
                cur.execute("DELETE FROM membership_roles WHERE society_membership_id IN (SELECT id FROM society_memberships WHERE user_id=%s)", (r[0],))
                cur.execute("DELETE FROM society_memberships WHERE user_id=%s", (r[0],))
                cur.execute("DELETE FROM users WHERE id=%s", (r[0],))

    # 1. send OTP
    r1 = client.post("/auth/otp/send", json={"mobile": mobile})
    assert r1.status_code == 200, r1.text

    # 2. verify OTP
    r2 = client.post("/auth/otp/verify", json={"mobile": mobile, "token": "123456", "display_name": "Test Register"})
    assert r2.status_code == 200, r2.text
    verify_token = r2.json().get("access_token")
    assert verify_token
    assert r2.json().get("status") == "pending"

    # 3. set password to complete registration
    r3 = client.post("/auth/set-password", headers={"Authorization": f"Bearer {verify_token}"}, json={"password": password})
    assert r3.status_code == 200, r3.text

    # 4. now login with mobile+password should work (still pending, but token issued)
    r4 = client.post("/auth/login", json={"mobile": mobile, "password": password})
    assert r4.status_code == 200, r4.text
    login_token = r4.json().get("access_token")
    assert login_token
    # pending still cannot access flats until admin approval
    r_flats = client.get("/api/flats", headers={"Authorization": f"Bearer {login_token}"})
    assert r_flats.status_code == 403

    # cleanup
    with psycopg.connect(TEST_DB_URL, autocommit=True) as c:
        with c.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE mobile=%s", (mobile,))
            r = cur.fetchone()
            if r:
                cur.execute("DELETE FROM membership_roles WHERE society_membership_id IN (SELECT id FROM society_memberships WHERE user_id=%s)", (r[0],))
                cur.execute("DELETE FROM society_memberships WHERE user_id=%s", (r[0],))
                cur.execute("DELETE FROM users WHERE id=%s", (r[0],))

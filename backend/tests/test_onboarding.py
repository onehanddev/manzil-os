"""TDD for onboarding – first signup must complete society + opening balance before using app.

Seams:
  - HTTP via TestClient: GET /api/onboarding/status, POST /api/onboarding/setup
  - Supabase JWT mocked via SUPABASE_JWT_SECRET
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


def _supabase_env(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", TEST_SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_SUPABASE_JWT_SECRET)
    monkeypatch.setenv("SUPABASE_ANON_KEY", "test-anon")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service")
    monkeypatch.setenv("SUPABASE_TEST_OTP", "1")


def _mint_token(auth_id, mobile):
    return pyjwt.encode(
        {"sub": auth_id, "phone": mobile, "aud": "authenticated", "exp": 9999999999},
        TEST_SUPABASE_JWT_SECRET,
        algorithm="HS256",
    )


def test_onboarding_status_needs_onboarding_when_empty(monkeypatch):
    _supabase_env(monkeypatch)
    client = _client()

    # Save opening balances to restore after – clean previous test user with FK order
    with psycopg.connect(TEST_DB_URL, autocommit=True) as c:
        with c.cursor() as cur:
            cur.execute("DELETE FROM cash_opening_balances")
            cur.execute("SELECT id FROM users WHERE mobile IN ('+919000099900', '+919000099901')")
            for (uid,) in cur.fetchall():
                cur.execute("DELETE FROM membership_roles WHERE society_membership_id IN (SELECT id FROM society_memberships WHERE user_id=%s)", (uid,))
                cur.execute("DELETE FROM receipts WHERE collected_by IN (SELECT id FROM society_memberships WHERE user_id=%s)", (uid,))
                cur.execute("DELETE FROM expenses WHERE created_by IN (SELECT id FROM society_memberships WHERE user_id=%s)", (uid,))
                cur.execute("DELETE FROM cash_opening_balances WHERE created_by IN (SELECT id FROM society_memberships WHERE user_id=%s)", (uid,))
                cur.execute("DELETE FROM notifications WHERE user_id=%s", (uid,))
                cur.execute("DELETE FROM push_subscriptions WHERE user_id=%s", (uid,))
                cur.execute("DELETE FROM society_memberships WHERE user_id=%s", (uid,))
                cur.execute("DELETE FROM users WHERE id=%s", (uid,))

    # create a user via signup seam (phone-masked)
    import app.auth.router as rm
    import app.auth.supabase_client as sc

    store = {}

    def mock_create(mobile, password, display_name):
        from app.auth.security import normalize_mobile

        n = normalize_mobile(mobile)
        aid = str(uuid.uuid4())
        store[n] = (aid, password)
        return aid

    def mock_sign(mobile, password):
        from app.auth.security import normalize_mobile

        n = normalize_mobile(mobile)
        e = store.get(n)
        if not e:
            return None
        aid, pw = e
        if pw != password:
            return None
        token = _mint_token(aid, n)
        return {"access_token": token, "user": {"id": aid}}

    monkeypatch.setattr(rm, "supabase_create_user", mock_create)
    monkeypatch.setattr(rm, "supabase_sign_in", mock_sign)
    monkeypatch.setattr(sc, "supabase_create_user", mock_create)
    monkeypatch.setattr(sc, "supabase_sign_in", mock_sign)

    mobile = "+919000099900"
    pw = "TestPass123"
    r = client.post("/auth/signup", json={"mobile": mobile, "password": pw, "display_name": "First Owner"})
    assert r.status_code == 200, r.text
    token = r.json().get("access_token")
    assert token

    # status should say needs onboarding
    s = client.get("/api/onboarding/status", headers={"Authorization": f"Bearer {token}"})
    assert s.status_code == 200, s.text
    assert s.json().get("needs_onboarding") is True

    # setup onboarding
    setup = client.post(
        "/api/onboarding/setup",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "My Society",
            "location": "Pune",
            "city": "Pune",
            "opening_date": "2026-09-01",
            "opening_amount": 50000,
        },
    )
    assert setup.status_code == 200, setup.text
    assert setup.json().get("society", {}).get("name") == "My Society"

    # after setup, status false
    s2 = client.get("/api/onboarding/status", headers={"Authorization": f"Bearer {token}"})
    assert s2.status_code == 200
    assert s2.json().get("needs_onboarding") is False

    # me should now have active membership
    me = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json().get("roles") == ["SOCIETY_ADMIN"]

    # cleanup – remove test user and restore pilot
    with psycopg.connect(TEST_DB_URL, autocommit=True) as c:
        with c.cursor() as cur:
            cur.execute("SELECT id, mobile, display_name, auth_user_id FROM users WHERE mobile='+919000000000'")
            admin = cur.fetchone()
            cur.execute("SELECT id FROM users WHERE mobile='+919000099900'")
            test_row = cur.fetchone()
            if test_row:
                # Remove all memberships for test user via truncate cascade for that user is complex; instead truncate all memberships and re-create admin
                cur.execute("TRUNCATE society_memberships CASCADE")
                # Now users can be deleted
                cur.execute("DELETE FROM users WHERE mobile IN ('+919000099900', '+919000099901')")
                # Restore pilot society name if renamed
                cur.execute("UPDATE societies SET name='Manzil Pilot Society', location='Pilot Location', city='Pune' WHERE id='00000000-0000-0000-0000-000000000001'")
                cur.execute("INSERT INTO societies (id, name, location, city) VALUES ('00000000-0000-0000-0000-000000000001','Manzil Pilot Society','Pilot Location','Pune') ON CONFLICT (id) DO NOTHING")
                cur.execute("DELETE FROM societies WHERE name='My Society' AND id != '00000000-0000-0000-0000-000000000001'")
                # Restore admin user and membership
                if admin:
                    # admin was deleted by TRUNCATE users CASCADE? No, TRUNCATE society_memberships CASCADE does not delete users, so admin user still exists, but its membership was deleted
                    cur.execute("SELECT id FROM society_memberships WHERE user_id=%s AND society_id='00000000-0000-0000-0000-000000000001'", (admin[0],))
                    if not cur.fetchone():
                        import uuid as _uuid
                        mid = str(_uuid.uuid4())
                        cur.execute("INSERT INTO society_memberships (id, user_id, society_id, status) VALUES (%s,%s,'00000000-0000-0000-0000-000000000001','ACTIVE')", (mid, admin[0]))
                        cur.execute("SELECT id FROM roles WHERE key='SOCIETY_ADMIN'")
                        role_row = cur.fetchone()
                        if role_row:
                            cur.execute("INSERT INTO membership_roles (society_membership_id, role_id) VALUES (%s,%s) ON CONFLICT DO NOTHING", (mid, role_row[0]))
            else:
                cur.execute("UPDATE societies SET name='Manzil Pilot Society', location='Pilot Location', city='Pune' WHERE id='00000000-0000-0000-0000-000000000001' AND name='My Society'")
                cur.execute("DELETE FROM societies WHERE name='My Society' AND id != '00000000-0000-0000-0000-000000000001'")
            cur.execute("INSERT INTO funds (id, society_id, name, is_active) VALUES ('00000000-0000-0000-0000-000000000501','00000000-0000-0000-0000-000000000001','Main Fund',TRUE), ('00000000-0000-0000-0000-000000000502','00000000-0000-0000-0000-000000000001','Sinking Fund',TRUE) ON CONFLICT (id) DO NOTHING")
            cur.execute("INSERT INTO flat_categories (id, society_id, name, is_active) VALUES ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000001','1 BHK',TRUE), ('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000001','2 BHK',TRUE) ON CONFLICT (id) DO NOTHING")

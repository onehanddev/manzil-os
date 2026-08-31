"""Issue 4 – Master Data + Opening Dues (TDD).

Seams under test (pre-agreed):
  - HTTP seam: FastAPI TestClient with Supabase JWT via `Authorization: Bearer <token>`
  - All master-data endpoints are admin-only (COLLECTOR -> 403), unauthenticated -> 401

Vertical slice order: flat_categories -> flats -> persons/occupants -> opening_dues -> default-payer
Each test hits the public HTTP boundary, not internal DB queries.
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


def _admin_token(client):
    resp = _login(client, "+919000000000", "admin123")
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _collector_token(client, admin_token):
    mobile = "+919000000100"
    # create if not exists
    create_resp = client.post(
        "/api/admin/users",
        headers=_auth_header(admin_token),
        json={"mobile": mobile, "password": "collector123", "display_name": "Collector One", "role": "COLLECTOR"},
    )
    # 409 means already exists from previous test run
    if create_resp.status_code not in (200, 201, 409):
        raise AssertionError(create_resp.text)
    resp = _login(client, mobile, "collector123")
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


# ---- Slice 1: flat_categories ----


def test_admin_can_create_and_list_flat_categories(conn):
    """AC1: Admin can create/list flat categories."""
    client = _client()
    token = _admin_token(client)

    name = f"CAT-{uuid.uuid4().hex[:6]}"
    create = client.post("/api/flat-categories", headers=_auth_header(token), json={"name": name})
    assert create.status_code in (200, 201), create.text
    cat_id = create.json().get("id")
    assert cat_id

    listing = client.get("/api/flat-categories", headers=_auth_header(token))
    assert listing.status_code == 200, listing.text
    names = [c["name"] for c in listing.json().get("categories", listing.json().get("flat_categories", []))]
    # fallback: listing may return {"categories": [...]} or {"data": [...]} – accept either containing our name
    raw_text = listing.text
    assert name in raw_text, f"name {name} not in listing {raw_text}"


def test_admin_can_deactivate_flat_category(conn):
    client = _client()
    token = _admin_token(client)
    name = f"DEACT-{uuid.uuid4().hex[:6]}"
    create = client.post("/api/flat-categories", headers=_auth_header(token), json={"name": name})
    assert create.status_code in (200, 201), create.text
    cat_id = create.json()["id"]
    patch = client.patch(f"/api/flat-categories/{cat_id}", headers=_auth_header(token), json={"is_active": False})
    assert patch.status_code == 200, patch.text
    assert patch.json().get("is_active") is False or patch.json().get("category", {}).get("is_active") is False


def test_collector_cannot_create_flat_category(conn):
    client = _client()
    admin_token = _admin_token(client)
    collector_token = _collector_token(client, admin_token)
    resp = client.post(
        "/api/flat-categories", headers=_auth_header(collector_token), json={"name": "SHOULD-FAIL"}
    )
    assert resp.status_code == 403, resp.text


# ---- Slice 2: flats ----


def test_admin_can_create_and_list_flats(conn):
    client = _client()
    token = _admin_token(client)
    # ensure category exists
    cat_name = f"FLATCAT-{uuid.uuid4().hex[:6]}"
    cat = client.post("/api/flat-categories", headers=_auth_header(token), json={"name": cat_name})
    assert cat.status_code in (200, 201), cat.text
    cat_id = cat.json()["id"]

    flat_number = f"F-{uuid.uuid4().hex[:4]}"
    create = client.post(
        "/api/flats", headers=_auth_header(token), json={"flat_number": flat_number, "flat_category_id": cat_id}
    )
    assert create.status_code in (200, 201), create.text
    flat_id = create.json().get("id") or create.json().get("flat", {}).get("id")
    assert flat_id

    listing = client.get("/api/flats", headers=_auth_header(token))
    assert listing.status_code == 200, listing.text
    assert flat_number in listing.text

    detail = client.get(f"/api/flats/{flat_id}", headers=_auth_header(token))
    assert detail.status_code == 200, detail.text
    assert detail.json().get("flat_number") == flat_number or detail.json().get("flat", {}).get("flat_number") == flat_number


def test_duplicate_flat_number_rejected(conn):
    client = _client()
    token = _admin_token(client)
    cat_name = f"DUPCAT-{uuid.uuid4().hex[:6]}"
    cat = client.post("/api/flat-categories", headers=_auth_header(token), json={"name": cat_name})
    assert cat.status_code in (200, 201), cat.text
    cat_id = cat.json()["id"]
    flat_number = f"DUP-{uuid.uuid4().hex[:4]}"
    r1 = client.post(
        "/api/flats", headers=_auth_header(token), json={"flat_number": flat_number, "flat_category_id": cat_id}
    )
    assert r1.status_code in (200, 201), r1.text
    r2 = client.post(
        "/api/flats", headers=_auth_header(token), json={"flat_number": flat_number, "flat_category_id": cat_id}
    )
    assert r2.status_code == 409, r2.text


def test_collector_cannot_create_flat(conn):
    client = _client()
    admin_token = _admin_token(client)
    collector_token = _collector_token(client, admin_token)
    resp = client.post(
        "/api/flats",
        headers=_auth_header(collector_token),
        json={"flat_number": "X-999", "flat_category_id": "00000000-0000-0000-0000-000000000101"},
    )
    assert resp.status_code == 403, resp.text


# ---- Slice 3: persons + occupants ----


def test_admin_can_create_persons_and_assign_occupants(conn):
    client = _client()
    token = _admin_token(client)
    cat = client.post("/api/flat-categories", headers=_auth_header(token), json={"name": f"PCAT-{uuid.uuid4().hex[:4]}"})
    assert cat.status_code in (200, 201), cat.text
    cat_id = cat.json()["id"]
    flat_number = f"P-{uuid.uuid4().hex[:4]}"
    flat = client.post(
        "/api/flats", headers=_auth_header(token), json={"flat_number": flat_number, "flat_category_id": cat_id}
    )
    assert flat.status_code in (200, 201), flat.text
    flat_id = flat.json().get("id") or flat.json().get("flat", {}).get("id")

    owner = client.post(
        "/api/persons", headers=_auth_header(token), json={"name": "Owner One", "mobile": "9000000011"}
    )
    assert owner.status_code in (200, 201), owner.text
    owner_id = owner.json().get("id") or owner.json().get("person", {}).get("id")
    tenant = client.post(
        "/api/persons", headers=_auth_header(token), json={"name": "Tenant One", "mobile": "9000000012"}
    )
    assert tenant.status_code in (200, 201), tenant.text
    tenant_id = tenant.json().get("id") or tenant.json().get("person", {}).get("id")

    occ_owner = client.post(
        f"/api/flats/{flat_id}/occupants", headers=_auth_header(token), json={"person_id": owner_id, "role": "OWNER"}
    )
    assert occ_owner.status_code in (200, 201), occ_owner.text

    occ_tenant = client.post(
        f"/api/flats/{flat_id}/occupants", headers=_auth_header(token), json={"person_id": tenant_id, "role": "TENANT"}
    )
    assert occ_tenant.status_code in (200, 201), occ_tenant.text


def test_double_active_owner_rejected(conn):
    client = _client()
    token = _admin_token(client)
    cat = client.post("/api/flat-categories", headers=_auth_header(token), json={"name": f"DCAT-{uuid.uuid4().hex[:4]}"})
    assert cat.status_code in (200, 201), cat.text
    cat_id = cat.json()["id"]
    flat = client.post(
        "/api/flats", headers=_auth_header(token), json={"flat_number": f"D-{uuid.uuid4().hex[:4]}", "flat_category_id": cat_id}
    )
    assert flat.status_code in (200, 201), flat.text
    flat_id = flat.json().get("id") or flat.json().get("flat", {}).get("id")

    p1 = client.post("/api/persons", headers=_auth_header(token), json={"name": "Owner A", "mobile": "9000000021"})
    p2 = client.post("/api/persons", headers=_auth_header(token), json={"name": "Owner B", "mobile": "9000000022"})
    p1_id = p1.json().get("id") or p1.json().get("person", {}).get("id")
    p2_id = p2.json().get("id") or p2.json().get("person", {}).get("id")

    r1 = client.post(f"/api/flats/{flat_id}/occupants", headers=_auth_header(token), json={"person_id": p1_id, "role": "OWNER"})
    assert r1.status_code in (200, 201), r1.text
    r2 = client.post(f"/api/flats/{flat_id}/occupants", headers=_auth_header(token), json={"person_id": p2_id, "role": "OWNER"})
    assert r2.status_code == 409, r2.text


def test_default_payer_returns_tenant_first_and_owner_fallback(conn):
    client = _client()
    token = _admin_token(client)
    cat = client.post("/api/flat-categories", headers=_auth_header(token), json={"name": f"DFCAT-{uuid.uuid4().hex[:4]}"})
    assert cat.status_code in (200, 201), cat.text
    cat_id = cat.json()["id"]

    # flat with only owner -> default is owner
    flat1 = client.post(
        "/api/flats", headers=_auth_header(token), json={"flat_number": f"DF1-{uuid.uuid4().hex[:4]}", "flat_category_id": cat_id}
    )
    assert flat1.status_code in (200, 201), flat1.text
    flat1_id = flat1.json().get("id") or flat1.json().get("flat", {}).get("id")
    owner = client.post("/api/persons", headers=_auth_header(token), json={"name": "Solo Owner", "mobile": "9000000031"})
    owner_id = owner.json().get("id") or owner.json().get("person", {}).get("id")
    client.post(f"/api/flats/{flat1_id}/occupants", headers=_auth_header(token), json={"person_id": owner_id, "role": "OWNER"})
    dp1 = client.get(f"/api/flats/{flat1_id}/default-payer", headers=_auth_header(token))
    assert dp1.status_code == 200, dp1.text
    assert dp1.json().get("person_id") == owner_id or dp1.json().get("default_payer", {}).get("id") == owner_id

    # flat with owner + tenant -> default is tenant
    flat2 = client.post(
        "/api/flats", headers=_auth_header(token), json={"flat_number": f"DF2-{uuid.uuid4().hex[:4]}", "flat_category_id": cat_id}
    )
    assert flat2.status_code in (200, 201), flat2.text
    flat2_id = flat2.json().get("id") or flat2.json().get("flat", {}).get("id")
    owner2 = client.post("/api/persons", headers=_auth_header(token), json={"name": "Owner2", "mobile": "9000000032"})
    tenant2 = client.post("/api/persons", headers=_auth_header(token), json={"name": "Tenant2", "mobile": "9000000033"})
    owner2_id = owner2.json().get("id") or owner2.json().get("person", {}).get("id")
    tenant2_id = tenant2.json().get("id") or tenant2.json().get("person", {}).get("id")
    client.post(f"/api/flats/{flat2_id}/occupants", headers=_auth_header(token), json={"person_id": owner2_id, "role": "OWNER"})
    client.post(f"/api/flats/{flat2_id}/occupants", headers=_auth_header(token), json={"person_id": tenant2_id, "role": "TENANT"})
    dp2 = client.get(f"/api/flats/{flat2_id}/default-payer", headers=_auth_header(token))
    assert dp2.status_code == 200, dp2.text
    assert dp2.json().get("person_id") == tenant2_id or dp2.json().get("default_payer", {}).get("id") == tenant2_id


def test_collector_cannot_create_person_or_assign(conn):
    client = _client()
    admin_token = _admin_token(client)
    collector_token = _collector_token(client, admin_token)
    r1 = client.post("/api/persons", headers=_auth_header(collector_token), json={"name": "X", "mobile": "9000000041"})
    assert r1.status_code == 403, r1.text
    # need a flat id for occupant test – use seeded category
    r2 = client.post(
        "/api/flats/00000000-0000-0000-0000-000000000001/occupants",
        headers=_auth_header(collector_token),
        json={"person_id": "00000000-0000-0000-0000-000000000401", "role": "OWNER"},
    )
    assert r2.status_code in (401, 403, 404), r2.text


# ---- Slice 4: opening_dues ----


def test_admin_can_set_and_get_opening_due(conn):
    client = _client()
    token = _admin_token(client)
    cat = client.post("/api/flat-categories", headers=_auth_header(token), json={"name": f"OCAT-{uuid.uuid4().hex[:4]}"})
    assert cat.status_code in (200, 201), cat.text
    cat_id = cat.json()["id"]
    flat = client.post(
        "/api/flats", headers=_auth_header(token), json={"flat_number": f"O-{uuid.uuid4().hex[:4]}", "flat_category_id": cat_id}
    )
    assert flat.status_code in (200, 201), flat.text
    flat_id = flat.json().get("id") or flat.json().get("flat", {}).get("id")

    put = client.put(f"/api/flats/{flat_id}/opening-due", headers=_auth_header(token), json={"amount": 2000})
    assert put.status_code in (200, 201), put.text

    get = client.get(f"/api/flats/{flat_id}/opening-due", headers=_auth_header(token))
    assert get.status_code == 200, get.text
    amt = get.json().get("amount")
    if amt is None:
        amt = get.json().get("opening_due", {}).get("amount")
    assert float(amt) == 2000


def test_collector_cannot_set_opening_due(conn):
    client = _client()
    admin_token = _admin_token(client)
    collector_token = _collector_token(client, admin_token)
    # create flat as admin first
    cat = client.post("/api/flat-categories", headers=_auth_header(admin_token), json={"name": f"OCAT2-{uuid.uuid4().hex[:4]}"})
    cat_id = cat.json()["id"]
    flat = client.post(
        "/api/flats", headers=_auth_header(admin_token), json={"flat_number": f"O2-{uuid.uuid4().hex[:4]}", "flat_category_id": cat_id}
    )
    flat_id = flat.json().get("id") or flat.json().get("flat", {}).get("id")
    resp = client.put(f"/api/flats/{flat_id}/opening-due", headers=_auth_header(collector_token), json={"amount": 1000})
    assert resp.status_code == 403, resp.text


def test_opening_due_amount_must_be_non_negative(conn):
    client = _client()
    token = _admin_token(client)
    cat = client.post("/api/flat-categories", headers=_auth_header(token), json={"name": f"OCAT3-{uuid.uuid4().hex[:4]}"})
    cat_id = cat.json()["id"]
    flat = client.post(
        "/api/flats", headers=_auth_header(token), json={"flat_number": f"O3-{uuid.uuid4().hex[:4]}", "flat_category_id": cat_id}
    )
    flat_id = flat.json().get("id") or flat.json().get("flat", {}).get("id")
    bad = client.put(f"/api/flats/{flat_id}/opening-due", headers=_auth_header(token), json={"amount": -100})
    assert bad.status_code in (400, 422), bad.text


def test_unauthenticated_rejected(conn):
    client = _client()
    assert client.get("/api/flat-categories").status_code == 401
    assert client.get("/api/flats").status_code == 401
    assert client.get("/api/persons").status_code == 401

"""Issue 5 TDD – Maintenance Collection + Toggleable Test Receipt/WhatsApp (red phase).

Seam: HTTP API via TestClient with Supabase JWT.
AC under test:
  1. Collector can create cash receipt from mobile viewport
  2. amount 0/negative rejected; missing business_date/flat_id/amount rejected
  3. Receipt linked to flat + payer + amount + business_date + narration + collected_by
  4. Default POC tenant-first else owner (via /flats/{id}/default-payer already, but receipt payer validation)
  5. Created receipt appears in GET /receipts filtered by flat/society
  6. In test mode, receipt creation logs notification (no external WhatsApp) and still 201
  7. Non-CASH methods not shown / rejected
  8. payer_person_id must be occupant of flat (422 otherwise)
  9. payment_method fixed CASH

These tests are expected to FAIL before implementation (red).
"""

import uuid

import jwt as pyjwt
import psycopg
import pytest
from fastapi.testclient import TestClient

from conftest import TEST_DB_URL
from tests.test_master_data import _admin_token, _auth_header, _client, _collector_token

TEST_SUPABASE_URL = "https://test.supabase.co"
TEST_SUPABASE_JWT_SECRET = "test-supabase-jwt-secret-32-chars-long!!"


@pytest.fixture(autouse=True)
def _supabase_env_and_mock(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", TEST_SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_SUPABASE_JWT_SECRET)
    monkeypatch.setenv("SUPABASE_ANON_KEY", "test-anon-key")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
    monkeypatch.setenv("PROVIDER_MODE", "test")
    _store: dict[str, tuple[str, str]] = {}
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
                _store["+919000000000"] = (auth_id, "admin123")
    import app.admin.router as admin_router_mod
    import app.auth.router as router_mod
    import app.auth.supabase_client as sc_mod

    def _mock_create_user(mobile, password, display_name):
        from app.auth.security import normalize_mobile

        norm = normalize_mobile(mobile)
        if norm in _store:
            return None
        auth_id = str(uuid.uuid4())
        _store[norm] = (auth_id, password)
        return auth_id

    def _mock_sign_in(mobile, password):
        from app.auth.security import normalize_mobile

        norm = normalize_mobile(mobile)
        entry = _store.get(norm)
        if not entry:
            return None
        auth_id, pw = entry
        if pw != password:
            return None
        token = pyjwt.encode({"sub": auth_id, "phone": norm, "aud": "authenticated", "exp": 9999999999}, TEST_SUPABASE_JWT_SECRET, algorithm="HS256")
        return {"access_token": token, "user": {"id": auth_id}}

    monkeypatch.setattr(router_mod, "supabase_sign_in", _mock_sign_in)
    monkeypatch.setattr(admin_router_mod, "supabase_create_user", _mock_create_user)
    monkeypatch.setattr(sc_mod, "supabase_create_user", _mock_create_user)
    monkeypatch.setattr(sc_mod, "supabase_sign_in", _mock_sign_in)
    yield
    with psycopg.connect(TEST_DB_URL, autocommit=True) as c:
        with c.cursor() as cur:
            cur.execute("DELETE FROM receipts WHERE business_date >= '2099-06-01'")
            cur.execute("DELETE FROM notifications WHERE created_at >= '2099-06-01'::timestamptz OR business_date >= '2099-06-01'")
            # cleanup persons/flats created with prefix ISS5-


def _fund(client, token):
    r = client.get("/api/funds", headers=_auth_header(token))
    assert r.status_code == 200, r.text
    return r.json()["funds"][0]["id"]


def _setup_flat_with_occupants(client, token):
    cat = client.post("/api/flat-categories", headers=_auth_header(token), json={"name": f"ISS5-CAT-{uuid.uuid4().hex[:4]}"})
    assert cat.status_code in (200, 201), cat.text
    cat_id = cat.json()["id"]
    flat = client.post("/api/flats", headers=_auth_header(token), json={"flat_number": f"ISS5-F-{uuid.uuid4().hex[:4]}", "flat_category_id": cat_id})
    assert flat.status_code in (200, 201), flat.text
    flat_id = flat.json().get("id") or flat.json().get("flat", {}).get("id")
    owner = client.post("/api/persons", headers=_auth_header(token), json={"name": f"ISS5-Owner-{uuid.uuid4().hex[:4]}", "mobile": f"90000{uuid.uuid4().hex[:5]}"})
    assert owner.status_code in (200, 201), owner.text
    owner_id = owner.json().get("id") or owner.json().get("person", {}).get("id")
    tenant = client.post("/api/persons", headers=_auth_header(token), json={"name": f"ISS5-Tenant-{uuid.uuid4().hex[:4]}", "mobile": f"90000{uuid.uuid4().hex[:5]}"})
    assert tenant.status_code in (200, 201), tenant.text
    tenant_id = tenant.json().get("id") or tenant.json().get("person", {}).get("id")
    outsider = client.post("/api/persons", headers=_auth_header(token), json={"name": f"ISS5-Out-{uuid.uuid4().hex[:4]}", "mobile": f"90000{uuid.uuid4().hex[:5]}"})
    outsider_id = outsider.json().get("id") or outsider.json().get("person", {}).get("id")
    # assign owner + tenant to flat, outsider stays unassigned
    r = client.post(f"/api/flats/{flat_id}/occupants", headers=_auth_header(token), json={"person_id": owner_id, "role": "OWNER"})
    assert r.status_code in (200, 201), r.text
    r = client.post(f"/api/flats/{flat_id}/occupants", headers=_auth_header(token), json={"person_id": tenant_id, "role": "TENANT"})
    assert r.status_code in (200, 201), r.text
    return flat_id, owner_id, tenant_id, outsider_id


def test_payer_must_be_occupant_of_flat(conn):
    client = _client()
    token = _admin_token(client)
    fund_id = _fund(client, token)
    flat_id, owner_id, tenant_id, outsider_id = _setup_flat_with_occupants(client, token)
    # outsider is valid society person but NOT occupant -> should be rejected 422
    r = client.post("/api/receipts", headers=_auth_header(token), json={"flat_id": flat_id, "amount": 1000, "business_date": "2099-06-10", "fund_id": fund_id, "payer_person_id": outsider_id})
    assert r.status_code == 422, f"expected 422 for non-occupant payer, got {r.status_code} {r.text}"
    # tenant (occupant) should succeed
    r2 = client.post("/api/receipts", headers=_auth_header(token), json={"flat_id": flat_id, "amount": 1000, "business_date": "2099-06-10", "fund_id": fund_id, "payer_person_id": tenant_id})
    assert r2.status_code == 201, r2.text


def test_payment_method_only_cash(conn):
    client = _client()
    token = _admin_token(client)
    fund_id = _fund(client, token)
    flat_id, owner_id, _, _ = _setup_flat_with_occupants(client, token)
    # CASH should succeed (explicit)
    r = client.post("/api/receipts", headers=_auth_header(token), json={"flat_id": flat_id, "amount": 500, "business_date": "2099-06-11", "fund_id": fund_id, "payer_person_id": owner_id, "payment_method": "CASH"})
    assert r.status_code == 201, r.text
    assert r.json().get("payment_method") == "CASH" or r.json().get("payment_method") is None or "CASH" in r.text
    # non-CASH should be rejected 422
    r2 = client.post("/api/receipts", headers=_auth_header(token), json={"flat_id": flat_id, "amount": 500, "business_date": "2099-06-11", "fund_id": fund_id, "payer_person_id": owner_id, "payment_method": "BANK"})
    assert r2.status_code == 422, f"non-CASH should be rejected, got {r2.status_code} {r2.text}"
    r3 = client.post("/api/receipts", headers=_auth_header(token), json={"flat_id": flat_id, "amount": 500, "business_date": "2099-06-11", "fund_id": fund_id, "payer_person_id": owner_id, "payment_method": "UPI"})
    assert r3.status_code == 422, r3.text


def test_receipt_missing_required_fields_rejected(conn):
    client = _client()
    token = _admin_token(client)
    fund_id = _fund(client, token)
    flat_id, owner_id, _, _ = _setup_flat_with_occupants(client, token)
    # missing business_date
    r = client.post("/api/receipts", headers=_auth_header(token), json={"flat_id": flat_id, "amount": 500, "fund_id": fund_id, "payer_person_id": owner_id})
    assert r.status_code == 422, r.text
    # missing flat_id
    r = client.post("/api/receipts", headers=_auth_header(token), json={"amount": 500, "business_date": "2099-06-12", "fund_id": fund_id})
    assert r.status_code == 422, r.text
    # missing amount
    r = client.post("/api/receipts", headers=_auth_header(token), json={"flat_id": flat_id, "business_date": "2099-06-12", "fund_id": fund_id})
    assert r.status_code == 422, r.text
    # amount 0 rejected
    r = client.post("/api/receipts", headers=_auth_header(token), json={"flat_id": flat_id, "amount": 0, "business_date": "2099-06-12", "fund_id": fund_id})
    assert r.status_code == 422, r.text


def test_receipts_filtered_by_flat_id(conn):
    client = _client()
    token = _admin_token(client)
    fund_id = _fund(client, token)
    cat = client.post("/api/flat-categories", headers=_auth_header(token), json={"name": f"FLT-{uuid.uuid4().hex[:4]}"})
    cat_id = cat.json()["id"]
    flat_a = client.post("/api/flats", headers=_auth_header(token), json={"flat_number": f"FA-{uuid.uuid4().hex[:4]}", "flat_category_id": cat_id})
    flat_a_id = flat_a.json().get("id") or flat_a.json().get("flat", {}).get("id")
    flat_b = client.post("/api/flats", headers=_auth_header(token), json={"flat_number": f"FB-{uuid.uuid4().hex[:4]}", "flat_category_id": cat_id})
    flat_b_id = flat_b.json().get("id") or flat_b.json().get("flat", {}).get("id")
    # need occupants for payer validation – assign owner to each
    p_a = client.post("/api/persons", headers=_auth_header(token), json={"name": f"PA-{uuid.uuid4().hex[:4]}", "mobile": f"90000{uuid.uuid4().hex[:5]}"})
    p_a_id = p_a.json().get("id")
    p_b = client.post("/api/persons", headers=_auth_header(token), json={"name": f"PB-{uuid.uuid4().hex[:4]}", "mobile": f"90000{uuid.uuid4().hex[:5]}"})
    p_b_id = p_b.json().get("id")
    client.post(f"/api/flats/{flat_a_id}/occupants", headers=_auth_header(token), json={"person_id": p_a_id, "role": "OWNER"})
    client.post(f"/api/flats/{flat_b_id}/occupants", headers=_auth_header(token), json={"person_id": p_b_id, "role": "OWNER"})
    client.post("/api/receipts", headers=_auth_header(token), json={"flat_id": flat_a_id, "amount": 2000, "business_date": "2099-06-20", "fund_id": fund_id, "payer_person_id": p_a_id})
    client.post("/api/receipts", headers=_auth_header(token), json={"flat_id": flat_b_id, "amount": 500, "business_date": "2099-06-20", "fund_id": fund_id, "payer_person_id": p_b_id})
    # filter by flat_a should return only 2000
    r = client.get(f"/api/receipts?flat_id={flat_a_id}", headers=_auth_header(token))
    assert r.status_code == 200, r.text
    receipts = r.json()["receipts"]
    assert any(x["flat_id"] == flat_a_id and float(x["amount"]) == 2000 for x in receipts), f"expected flat_a receipt, got {receipts}"
    assert all(x["flat_id"] == flat_a_id for x in receipts), f"filter leaked other flat: {receipts}"


def test_receipt_creation_logs_in_app_notification_in_test_mode(conn):
    client = _client()
    token = _admin_token(client)
    fund_id = _fund(client, token)
    flat_id, _, tenant_id, _ = _setup_flat_with_occupants(client, token)
    # create receipt – should still 201 and create in-app notification
    r = client.post("/api/receipts", headers=_auth_header(token), json={"flat_id": flat_id, "amount": 1200, "business_date": "2099-06-15", "fund_id": fund_id, "payer_person_id": tenant_id, "narration": "June maint"})
    assert r.status_code == 201, r.text
    receipt_id = r.json()["id"]
    # notification center should have record for this receipt/payer
    nr = client.get("/api/notifications", headers=_auth_header(token))
    assert nr.status_code == 200, nr.text
    notifs = nr.json().get("notifications") or nr.json().get("data") or []
    assert any(n.get("receipt_id") == receipt_id or str(n.get("receipt_id")) == receipt_id for n in notifs), f"no notification for receipt {receipt_id} in {notifs}"
    # also verify provider mode is test (no external call) – existence of notification proves test provider was used


def test_receipt_type_part_and_advance_allowed(conn):
    client = _client()
    token = _admin_token(client)
    fund_id = _fund(client, token)
    flat_id, owner_id, _, _ = _setup_flat_with_occupants(client, token)
    for t in ["PART", "ADVANCE", "ARREARS", "REGULAR"]:
        r = client.post("/api/receipts", headers=_auth_header(token), json={"flat_id": flat_id, "amount": 100, "business_date": "2099-06-18", "fund_id": fund_id, "payer_person_id": owner_id, "type": t})
        assert r.status_code == 201, f"type {t} should be allowed: {r.text}"
        assert r.json()["type"] == t

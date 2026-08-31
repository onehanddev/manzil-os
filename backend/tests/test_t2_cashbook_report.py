"""T2 Cashbook Report Core — TDD red phase.

Seam: HTTP API via TestClient with Supabase JWT.
Acceptance (from #10):
 - Admin can set/view opening balance for selected from date (PUT/GET /api/cash-opening-balance)
 - Collector blocked from PUT opening (403), unauth 401 for both
 - Admin can generate cashbook report for from/to inclusive business_date
 - Report shows society header, selected range, summary opening/receipts/expenses/closing where closing = opening + receipts - expenses
 - Receipt rows show date, narration, amount, flat, fund; Expense rows show date, narration, amount, category, vendor, fund
 - Combined statement: receipts + expenses in one view
 - VOIDED receipts excluded from totals but accessible via include_voided
 - Business_date filtering not created_at
 - Pilot fixture 206394 + 120200 - 82300 = 244294
 - Collector cannot see full cashbook totals (403), unauth 401
"""

import uuid

import jwt as pyjwt
import psycopg
import pytest

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
            cur.execute("DELETE FROM expenses WHERE business_date >= '2099-07-01'")
            cur.execute("DELETE FROM receipts WHERE business_date >= '2099-07-01'")
            cur.execute("DELETE FROM cash_opening_balances WHERE opening_date >= '2099-07-01'")
            cur.execute("SELECT id FROM users WHERE mobile IN ('+919000000100')")
            rows = cur.fetchall()
            for (uid,) in rows:
                cur.execute("DELETE FROM membership_roles WHERE society_membership_id IN (SELECT id FROM society_memberships WHERE user_id=%s)", (uid,))
                cur.execute("DELETE FROM society_memberships WHERE user_id=%s", (uid,))
                cur.execute("DELETE FROM users WHERE id=%s", (uid,))


def _fund_and_category(client, token):
    r = client.get("/api/funds", headers=_auth_header(token))
    assert r.status_code == 200, r.text
    fund_id = r.json()["funds"][0]["id"]
    r = client.get("/api/expense-categories", headers=_auth_header(token))
    assert r.status_code == 200, r.text
    cats = r.json().get("categories") or r.json().get("expense_categories")
    cat_id = cats[0]["id"]
    return fund_id, cat_id


def _flat_and_person(client, token):
    cat = client.post("/api/flat-categories", headers=_auth_header(token), json={"name": f"T2-CAT-{uuid.uuid4().hex[:4]}"})
    assert cat.status_code in (200, 201), cat.text
    cat_id = cat.json()["id"]
    flat = client.post("/api/flats", headers=_auth_header(token), json={"flat_number": f"T2-F-{uuid.uuid4().hex[:4]}", "flat_category_id": cat_id})
    assert flat.status_code in (200, 201), flat.text
    flat_id = flat.json().get("id") or flat.json().get("flat", {}).get("id")
    person = client.post("/api/persons", headers=_auth_header(token), json={"name": "T2 Payer", "mobile": f"90000{uuid.uuid4().hex[:5]}"})
    assert person.status_code in (200, 201), person.text
    person_id = person.json().get("id") or person.json().get("person", {}).get("id")
    occ = client.post(f"/api/flats/{flat_id}/occupants", headers=_auth_header(token), json={"person_id": person_id, "role": "OWNER"})
    assert occ.status_code in (200, 201), occ.text
    return flat_id, person_id


def test_collector_cannot_view_cashbook_report(conn):
    client = _client()
    admin_token = _admin_token(client)
    collector_token = _collector_token(client, admin_token)
    # Collector should be blocked from full cashbook totals
    r = client.get("/api/reports/cashbook?from=2099-07-01&to=2099-07-31", headers=_auth_header(collector_token))
    assert r.status_code == 403, f"collector should be 403 for report, got {r.status_code} {r.text}"
    assert "Admin only" in r.text or "admin" in r.text.lower()


def test_unauth_report_and_opening_rejected(conn):
    client = _client()
    assert client.get("/api/reports/cashbook?from=2099-07-01&to=2099-07-31").status_code == 401
    assert client.get("/api/cash-opening-balance?date=2099-07-01").status_code == 401
    assert client.put("/api/cash-opening-balance", json={"opening_date": "2099-07-01", "amount": 100}).status_code == 401


def test_collector_cannot_set_opening_balance(conn):
    client = _client()
    admin_token = _admin_token(client)
    collector_token = _collector_token(client, admin_token)
    r = client.put("/api/cash-opening-balance", headers=_auth_header(collector_token), json={"opening_date": "2099-07-02", "amount": 100})
    assert r.status_code == 403, r.text

    r = client.get("/api/cash-opening-balance?date=2099-07-02", headers=_auth_header(collector_token))
    assert r.status_code == 403, r.text


def test_admin_can_set_and_get_opening_balance_for_from_date(conn):
    client = _client()
    token = _admin_token(client)
    r = client.put("/api/cash-opening-balance", headers=_auth_header(token), json={"opening_date": "2099-07-03", "amount": 206394})
    assert r.status_code == 200, r.text
    assert float(r.json()["amount"]) == 206394
    r2 = client.get("/api/cash-opening-balance?date=2099-07-03", headers=_auth_header(token))
    assert r2.status_code == 200, r2.text
    assert float(r2.json()["amount"]) == 206394
    assert r2.json()["opening_date"] == "2099-07-03"
    assert r2.json()["exists"] is True

    missing = client.get("/api/cash-opening-balance?date=2099-07-04", headers=_auth_header(token))
    assert missing.status_code == 200, missing.text
    assert missing.json()["amount"] == 0
    assert missing.json()["exists"] is False


def test_report_fixture_206394_plus_120200_minus_82300_equals_244294(conn):
    client = _client()
    token = _admin_token(client)
    fund_id, cat_id = _fund_and_category(client, token)
    flat_id, _ = _flat_and_person(client, token)
    opening_date = "2099-07-01"
    from_d = "2099-07-01"
    to_d = "2099-07-31"
    client.put("/api/cash-opening-balance", headers=_auth_header(token), json={"opening_date": opening_date, "amount": 206394})
    client.post("/api/receipts", headers=_auth_header(token), json={"flat_id": flat_id, "amount": 80000, "business_date": "2099-07-10", "fund_id": fund_id, "narration": "July maint A"})
    client.post("/api/receipts", headers=_auth_header(token), json={"flat_id": flat_id, "amount": 40200, "business_date": "2099-07-15", "fund_id": fund_id, "narration": "July maint B"})
    client.post("/api/expenses", headers=_auth_header(token), json={"business_date": "2099-07-12", "amount": 50000, "fund_id": fund_id, "category_id": cat_id, "vendor_name": f"T2V-{uuid.uuid4().hex[:4]}", "narration": "Electricity"})
    client.post("/api/expenses", headers=_auth_header(token), json={"business_date": "2099-07-18", "amount": 32300, "fund_id": fund_id, "category_id": cat_id, "vendor_name": f"T2V-{uuid.uuid4().hex[:4]}", "narration": "Salary"})
    r = client.get(f"/api/reports/cashbook?from={from_d}&to={to_d}", headers=_auth_header(token))
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["from"] == from_d
    assert j["to"] == to_d
    assert j["opening"] == 206394
    assert j["total_receipts"] == 120200
    assert j["total_expenses"] == 82300
    assert j["closing"] == 244294
    assert j["society"]["name"] is not None
    # drillable rows with required keys
    assert len(j["receipts"]) >= 2
    assert len(j["expenses"]) >= 2
    assert all("id" in x and "business_date" in x and "amount" in x and "fund_id" in x for x in j["receipts"])
    assert all("id" in x and "business_date" in x and "amount" in x and "fund_id" in x and "category_id" in x for x in j["expenses"])
    assert all(x["flat"]["flat_number"] and x["fund"]["name"] for x in j["receipts"])
    assert all(x["category"]["name"] and x["vendor"]["name"] and x["fund"]["name"] for x in j["expenses"])


def test_voided_receipt_excluded_from_report_but_accessible_via_include_voided(conn):
    client = _client()
    token = _admin_token(client)
    fund_id, cat_id = _fund_and_category(client, token)
    flat_id, _ = _flat_and_person(client, token)
    # use distinct window to avoid collision with previous test
    client.put("/api/cash-opening-balance", headers=_auth_header(token), json={"opening_date": "2099-07-05", "amount": 1000})
    r = client.post("/api/receipts", headers=_auth_header(token), json={"flat_id": flat_id, "amount": 5000, "business_date": "2099-07-06", "fund_id": fund_id, "narration": "to be voided"})
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    # report before void should include it
    before = client.get("/api/reports/cashbook?from=2099-07-05&to=2099-07-10", headers=_auth_header(token))
    assert before.status_code == 200, before.text
    before_total = before.json()["total_receipts"]
    # void it
    v = client.post(f"/api/receipts/{rid}/void", headers=_auth_header(token), json={"reason": "correction"})
    assert v.status_code == 200, v.text
    assert v.json()["status"] == "VOIDED"
    # report after void should exclude its amount
    after = client.get("/api/reports/cashbook?from=2099-07-05&to=2099-07-10", headers=_auth_header(token))
    assert after.status_code == 200, after.text
    assert after.json()["total_receipts"] == before_total - 5000
    # include_voided view should still show it
    listing = client.get("/api/receipts?from=2099-07-05&to=2099-07-10&include_voided=true", headers=_auth_header(token))
    assert listing.status_code == 200, listing.text
    assert any(x["id"] == rid for x in listing.json()["receipts"])
    # without include_voided, voided not in list
    listing2 = client.get("/api/receipts?from=2099-07-05&to=2099-07-10", headers=_auth_header(token))
    assert listing2.status_code == 200, listing2.text
    assert all(x["id"] != rid for x in listing2.json()["receipts"])


def test_report_rows_drill_to_receipt_and_expense_sources(conn):
    client = _client()
    token = _admin_token(client)
    fund_id, cat_id = _fund_and_category(client, token)
    flat_id, _ = _flat_and_person(client, token)
    receipt = client.post(
        "/api/receipts",
        headers=_auth_header(token),
        json={"flat_id": flat_id, "amount": 321, "business_date": "2099-07-26", "fund_id": fund_id},
    )
    expense = client.post(
        "/api/expenses",
        headers=_auth_header(token),
        json={
            "business_date": "2099-07-26",
            "amount": 123,
            "fund_id": fund_id,
            "category_id": cat_id,
            "vendor_name": f"T2-DRILL-{uuid.uuid4().hex[:4]}",
        },
    )
    assert receipt.status_code == 201, receipt.text
    assert expense.status_code == 201, expense.text

    receipt_detail = client.get(f"/api/receipts/{receipt.json()['id']}", headers=_auth_header(token))
    expense_detail = client.get(f"/api/expenses/{expense.json()['id']}", headers=_auth_header(token))
    assert receipt_detail.status_code == 200, receipt_detail.text
    assert expense_detail.status_code == 200, expense_detail.text
    assert receipt_detail.json()["id"] == receipt.json()["id"]
    assert expense_detail.json()["id"] == expense.json()["id"]


def test_report_uses_business_date_not_created_at(conn):
    client = _client()
    token = _admin_token(client)
    fund_id, cat_id = _fund_and_category(client, token)
    flat_id, _ = _flat_and_person(client, token)
    client.put("/api/cash-opening-balance", headers=_auth_header(token), json={"opening_date": "2099-07-20", "amount": 500})
    # receipt dated outside window should not count even though created now
    client.post("/api/receipts", headers=_auth_header(token), json={"flat_id": flat_id, "amount": 99999, "business_date": "2099-07-19", "fund_id": fund_id})
    client.post("/api/receipts", headers=_auth_header(token), json={"flat_id": flat_id, "amount": 777, "business_date": "2099-07-21", "fund_id": fund_id})
    r = client.get("/api/reports/cashbook?from=2099-07-20&to=2099-07-25", headers=_auth_header(token))
    assert r.status_code == 200, r.text
    # only 777 should count; 99999 is outside
    # but there may be other receipts from prior tests in same window; check that 99999 not counted
    assert r.json()["total_receipts"] >= 777
    # precisely, if we use a fresh society? we can't guarantee no other receipts, but we can assert that amount 99999 not included by checking receipts list
    assert all(x["business_date"] != "2099-07-19" for x in r.json()["receipts"])


def test_report_rejects_from_greater_than_to(conn):
    client = _client()
    token = _admin_token(client)
    r = client.get("/api/reports/cashbook?from=2099-07-31&to=2099-07-01", headers=_auth_header(token))
    assert r.status_code == 400, r.text


def test_negative_opening_amount_rejected(conn):
    client = _client()
    token = _admin_token(client)
    r = client.put("/api/cash-opening-balance", headers=_auth_header(token), json={"opening_date": "2099-07-09", "amount": -1})
    assert r.status_code == 422, r.text

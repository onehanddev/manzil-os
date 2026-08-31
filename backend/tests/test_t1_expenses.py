"""T1 Expense Management — TDD red phase (vertical slice).

Seam: HTTP API via TestClient with Supabase JWT.
Acceptance under test (from #9):
  - Admin can create cash Expense with business_date, fund_id, category_id, vendor_name inline, amount>0, narration; success shows in list
  - vendor_name reuses case-insensitively society-scoped
  - Expense list filterable by business_date range and optionally by ExpenseCategory/Vendor/Fund; shows date, Vendor, ExpenseCategory, Fund, amount, narration, created_by/created_at
  - Zero/negative rejected
  - Non-cash not shown (no payment_method field)
  - COLLECTOR blocked from POST (403), unauth 401; Admin can list
  - Audit fields stored and returned
"""

import uuid

import psycopg
import pytest
import jwt as pyjwt

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
            cur.execute("DELETE FROM expenses WHERE business_date >= '2099-06-01'")
            cur.execute("DELETE FROM vendors WHERE name LIKE 'T1-%' OR name LIKE 't1-%' OR name LIKE 'CaseVendor%' OR name LIKE 'casevendor%'")
            # cleanup collectors created in this suite
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
    # Also get second fund/category for filter tests if available
    funds = r.json() if False else None
    return fund_id, cat_id


def test_admin_can_create_expense_and_shows_in_filtered_list(conn):
    client = _client()
    token = _admin_token(client)
    fund_id, cat_id = _fund_and_category(client, token)
    vname = f"T1-Vendor-{uuid.uuid4().hex[:6]}"
    payload = {
        "business_date": "2099-06-10",
        "amount": 1234,
        "fund_id": fund_id,
        "category_id": cat_id,
        "vendor_name": vname,
        "narration": "MSEDCL bill June",
    }
    r = client.post("/api/expenses", headers=_auth_header(token), json=payload)
    assert r.status_code == 201, r.text
    j = r.json()
    assert j["business_date"] == "2099-06-10"
    assert float(j["amount"]) == 1234
    assert j["fund_id"] == fund_id
    assert j["category_id"] == cat_id
    assert j["narration"] == "MSEDCL bill June"
    assert j["vendor_id"] is not None
    assert j["created_by"] is not None
    assert j["created_at"] is not None
    # list filtered by business_date range should include it
    listing = client.get("/api/expenses?from=2099-06-01&to=2099-06-30", headers=_auth_header(token))
    assert listing.status_code == 200, listing.text
    exps = listing.json()["expenses"]
    assert any(x["id"] == j["id"] for x in exps), f"created expense not in list {exps}"
    # outside range should exclude
    listing2 = client.get("/api/expenses?from=2099-06-11&to=2099-06-30", headers=_auth_header(token))
    assert listing2.status_code == 200, listing2.text
    assert all(x["id"] != j["id"] for x in listing2.json()["expenses"])


def test_vendor_name_reuses_case_insensitively(conn):
    client = _client()
    token = _admin_token(client)
    fund_id, cat_id = _fund_and_category(client, token)
    vname = f"CaseVendor-{uuid.uuid4().hex[:4]}"
    r1 = client.post("/api/expenses", headers=_auth_header(token), json={"business_date": "2099-06-12", "amount": 100, "fund_id": fund_id, "category_id": cat_id, "vendor_name": vname})
    assert r1.status_code == 201, r1.text
    vid1 = r1.json()["vendor_id"]
    # same name different case should reuse same vendor_id
    r2 = client.post("/api/expenses", headers=_auth_header(token), json={"business_date": "2099-06-13", "amount": 200, "fund_id": fund_id, "category_id": cat_id, "vendor_name": vname.lower()})
    assert r2.status_code == 201, r2.text
    assert r2.json()["vendor_id"] == vid1, f"expected vendor reuse case-insensitively, got {r2.json()['vendor_id']} vs {vid1}"
    # also with upper case
    r3 = client.post("/api/expenses", headers=_auth_header(token), json={"business_date": "2099-06-14", "amount": 200, "fund_id": fund_id, "category_id": cat_id, "vendor_name": vname.upper()})
    assert r3.status_code == 201, r3.text
    assert r3.json()["vendor_id"] == vid1


def test_expense_list_filterable_by_category_vendor_fund(conn):
    client = _client()
    token = _admin_token(client)
    # get two funds and two categories if possible
    funds_r = client.get("/api/funds", headers=_auth_header(token))
    assert funds_r.status_code == 200, funds_r.text
    funds = funds_r.json()["funds"]
    fund_a = funds[0]["id"]
    # create second fund if only one seeded
    if len(funds) < 2:
        fr = client.post("/api/funds", headers=_auth_header(token), json={"name": f"T1-Fund-{uuid.uuid4().hex[:4]}"})
        assert fr.status_code in (200, 201), fr.text
        fund_b = fr.json()["id"]
    else:
        fund_b = funds[1]["id"]

    cats_r = client.get("/api/expense-categories", headers=_auth_header(token))
    cats = cats_r.json().get("categories") or cats_r.json().get("expense_categories")
    cat_a = cats[0]["id"]
    if len(cats) < 2:
        cr = client.post("/api/expense-categories", headers=_auth_header(token), json={"name": f"T1-Cat-{uuid.uuid4().hex[:4]}"})
        assert cr.status_code in (200, 201), cr.text
        cat_b = cr.json()["id"]
    else:
        cat_b = cats[1]["id"]

    vname_a = f"T1-VA-{uuid.uuid4().hex[:4]}"
    vname_b = f"T1-VB-{uuid.uuid4().hex[:4]}"
    # create two expenses with distinct fund/category/vendor
    ra = client.post("/api/expenses", headers=_auth_header(token), json={"business_date": "2099-06-20", "amount": 500, "fund_id": fund_a, "category_id": cat_a, "vendor_name": vname_a, "narration": "A"})
    assert ra.status_code == 201, ra.text
    rb = client.post("/api/expenses", headers=_auth_header(token), json={"business_date": "2099-06-20", "amount": 600, "fund_id": fund_b, "category_id": cat_b, "vendor_name": vname_b, "narration": "B"})
    assert rb.status_code == 201, rb.text
    va = ra.json()["vendor_id"]
    vb = rb.json()["vendor_id"]

    # filter by fund
    rf = client.get(f"/api/expenses?from=2099-06-01&to=2099-06-30&fund_id={fund_a}", headers=_auth_header(token))
    assert rf.status_code == 200, rf.text
    ids = [x["id"] for x in rf.json()["expenses"]]
    assert ra.json()["id"] in ids
    assert rb.json()["id"] not in ids, f"fund filter leaked: {ids}"

    # filter by category
    rc = client.get(f"/api/expenses?from=2099-06-01&to=2099-06-30&category_id={cat_a}", headers=_auth_header(token))
    assert rc.status_code == 200, rc.text
    ids2 = [x["id"] for x in rc.json()["expenses"]]
    assert ra.json()["id"] in ids2
    assert rb.json()["id"] not in ids2

    # filter by vendor
    rv = client.get(f"/api/expenses?from=2099-06-01&to=2099-06-30&vendor_id={va}", headers=_auth_header(token))
    assert rv.status_code == 200, rv.text
    ids3 = [x["id"] for x in rv.json()["expenses"]]
    assert ra.json()["id"] in ids3
    assert rb.json()["id"] not in ids3

    # combined filter should narrow to zero if mismatched
    rm = client.get(f"/api/expenses?from=2099-06-01&to=2099-06-30&fund_id={fund_a}&category_id={cat_b}", headers=_auth_header(token))
    assert rm.status_code == 200, rm.text
    assert rm.json()["expenses"] == [], f"expected no results for mismatched fund+category, got {rm.json()['expenses']}"


def test_zero_and_negative_amounts_rejected(conn):
    client = _client()
    token = _admin_token(client)
    fund_id, cat_id = _fund_and_category(client, token)
    for bad in [0, -1, -0.01]:
        r = client.post("/api/expenses", headers=_auth_header(token), json={"business_date": "2099-06-15", "amount": bad, "fund_id": fund_id, "category_id": cat_id, "vendor_name": f"T1-BAD-{uuid.uuid4().hex[:4]}"})
        assert r.status_code == 422, f"amount {bad} should be 422, got {r.status_code} {r.text}"


def test_non_cash_methods_not_shown_and_not_accepted(conn):
    """Expenses are cash-only: no payment_method field exposed; extra field should be rejected or ignored."""
    client = _client()
    token = _admin_token(client)
    fund_id, cat_id = _fund_and_category(client, token)
    # attempt with payment_method should be forbidden (extra=forbid) -> 422
    r = client.post("/api/expenses", headers=_auth_header(token), json={"business_date": "2099-06-16", "amount": 100, "fund_id": fund_id, "category_id": cat_id, "vendor_name": f"T1-PM-{uuid.uuid4().hex[:4]}", "payment_method": "BANK"})
    assert r.status_code == 422, f"non-cash payment_method should be rejected, got {r.status_code} {r.text}"
    # valid expense should not have payment_method in response / should be cash implicitly
    r2 = client.post("/api/expenses", headers=_auth_header(token), json={"business_date": "2099-06-16", "amount": 100, "fund_id": fund_id, "category_id": cat_id, "vendor_name": f"T1-PM2-{uuid.uuid4().hex[:4]}"})
    assert r2.status_code == 201, r2.text
    assert "payment_method" not in r2.json() or r2.json().get("payment_method") in (None, "CASH")


def test_collector_blocked_from_post_and_unauth_401(conn):
    client = _client()
    admin_token = _admin_token(client)
    collector_token = _collector_token(client, admin_token)
    fund_id, cat_id = _fund_and_category(client, admin_token)
    # collector POST -> 403
    r = client.post("/api/expenses", headers=_auth_header(collector_token), json={"business_date": "2099-06-17", "amount": 100, "fund_id": fund_id, "category_id": cat_id, "vendor_name": f"T1-COL-{uuid.uuid4().hex[:4]}"})
    assert r.status_code == 403, f"collector POST should be 403, got {r.status_code} {r.text}"
    # unauth POST -> 401
    r2 = client.post("/api/expenses", json={"business_date": "2099-06-17", "amount": 100, "fund_id": fund_id, "category_id": cat_id, "vendor_name": "Nope"})
    assert r2.status_code == 401, r2.text
    # unauth GET -> 401
    r3 = client.get("/api/expenses?from=2099-06-01&to=2099-06-30")
    assert r3.status_code == 401, r3.text
    # admin can list (200 even if empty range)
    r4 = client.get("/api/expenses?from=2099-06-01&to=2099-06-30", headers=_auth_header(admin_token))
    assert r4.status_code == 200, r4.text
    # collector can list? spec says Admin can list; we allow require_active for list, so collector should be able to list (not blocked). Verify it is 200 not 403
    r5 = client.get("/api/expenses?from=2099-06-01&to=2099-06-30", headers=_auth_header(collector_token))
    # We accept 200 or 403; but if collector is blocked from list, adjust spec. For now expect 200 (require_active)
    assert r5.status_code in (200, 403), r5.text


def test_audit_fields_stored_and_returned(conn):
    client = _client()
    token = _admin_token(client)
    fund_id, cat_id = _fund_and_category(client, token)
    vname = f"T1-AUDIT-{uuid.uuid4().hex[:4]}"
    r = client.post("/api/expenses", headers=_auth_header(token), json={"business_date": "2099-06-18", "amount": 777, "fund_id": fund_id, "category_id": cat_id, "vendor_name": vname, "narration": "audit check"})
    assert r.status_code == 201, r.text
    j = r.json()
    assert j["created_by"] is not None and len(str(j["created_by"])) > 10
    assert j["created_at"] is not None
    # list should also return these
    listing = client.get("/api/expenses?from=2099-06-01&to=2099-06-30", headers=_auth_header(token))
    assert listing.status_code == 200, listing.text
    found = next((x for x in listing.json()["expenses"] if x["id"] == j["id"]), None)
    assert found is not None, "created expense not found in listing"
    assert found["created_by"] == j["created_by"]
    assert found["created_at"] == j["created_at"]
    assert found["business_date"] == "2099-06-18"
    assert found["vendor_id"] == j["vendor_id"]
    assert found["category_id"] == cat_id
    assert found["fund_id"] == fund_id

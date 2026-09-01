"""T4 daily cashbook delivery — scheduler and HTTP public seams."""

import uuid
from datetime import date

import jwt as pyjwt
import psycopg
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import _normalize
from conftest import TEST_DB_URL
from tests.test_master_data import _auth_header, _client
from tests.test_t2_cashbook_report import _flat_and_person, _fund_and_category


def _session():
    engine = create_engine(_normalize(TEST_DB_URL))
    return sessionmaker(bind=engine)()


@pytest.fixture(autouse=True)
def _authenticated_admin(monkeypatch):
    secret = "test-supabase-jwt-secret-32-chars-long!!"
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)
    with psycopg.connect(TEST_DB_URL, autocommit=True) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT auth_user_id FROM users WHERE mobile=%s", ("+919000000000",))
            auth_user_id = cursor.fetchone()[0] or uuid.uuid4()
            cursor.execute("UPDATE users SET auth_user_id=%s WHERE mobile=%s", (auth_user_id, "+919000000000"))
    return pyjwt.encode(
        {"sub": str(auth_user_id), "phone": "+919000000000", "aud": "authenticated", "exp": 9999999999},
        secret,
        algorithm="HS256",
    )


def test_non_idle_day_persists_cashbook_snapshot_and_push_bell_entry(conn, _authenticated_admin):
    """The nightly handler snapshots daily cash and records bell delivery."""
    client = _client()
    token = _authenticated_admin
    headers = _auth_header(token)
    fund_id, category_id = _fund_and_category(client, token)
    flat_id, _ = _flat_and_person(client, token)
    business_date = "2099-09-01"

    assert client.put(
        "/api/cash-opening-balance",
        headers=headers,
        json={"opening_date": business_date, "amount": 1000},
    ).status_code == 200
    assert client.post(
        "/api/receipts",
        headers=headers,
        json={"flat_id": flat_id, "amount": 500, "business_date": business_date, "fund_id": fund_id},
    ).status_code == 201
    assert client.post(
        "/api/expenses",
        headers=headers,
        json={
            "business_date": business_date,
            "amount": 125,
            "fund_id": fund_id,
            "category_id": category_id,
            "vendor_name": "T4 Electric",
        },
    ).status_code == 201

    from app.daily_reports.scheduler import run_daily_cashbook

    db = _session()
    try:
        result = run_daily_cashbook(db, business_date=date.fromisoformat(business_date))
    finally:
        db.close()

    assert result == {"processed": 1, "skipped": 0}
    history = client.get("/api/reports/history", headers=headers)
    assert history.status_code == 200, history.text
    run = next(item for item in history.json()["runs"] if item["from"] == business_date)
    assert run["opening"] == 1000
    assert run["total_receipts"] == 500
    assert run["total_expenses"] == 125
    assert run["closing"] == 1375
    assert run["format"] == "daily"

    notifications = client.get("/api/notifications", headers=headers)
    assert notifications.status_code == 200, notifications.text
    push = next(item for item in notifications.json()["notifications"] if item["channel"] == "PUSH")
    assert push["message"] == "Daily Report 01 Sep - Collected Rs. 500 (1 receipts), Expenses Rs. 125, Closing Rs. 1,375 - tap to view"


def test_admin_can_manage_a_push_subscription_without_vapid_credentials(conn, _authenticated_admin):
    client = _client()
    headers = _auth_header(_authenticated_admin)
    subscription = {
        "endpoint": "https://push.example.test/subscription-1",
        "keys": {"p256dh": "public-device-key", "auth": "device-auth-secret"},
    }

    public_key = client.get("/api/push/vapid_public_key", headers=headers)
    created = client.post("/api/push/subscribe", headers=headers, json=subscription)
    removed = client.request("DELETE", "/api/push/subscribe", headers=headers, json={"endpoint": subscription["endpoint"]})

    assert public_key.status_code == 200, public_key.text
    assert public_key.json() == {"public_key": None}
    assert created.status_code == 201, created.text
    assert created.json()["endpoint"] == subscription["endpoint"]
    assert removed.status_code == 204, removed.text


def test_idle_day_skips_snapshot_and_delivery(conn):
    from app.daily_reports.scheduler import run_daily_cashbook

    db = _session()
    try:
        result = run_daily_cashbook(db, business_date=date(2099, 9, 2))
    finally:
        db.close()

    assert result == {"processed": 0, "skipped": 1}


def test_daily_cashbook_job_rejects_missing_or_wrong_secret(monkeypatch):
    """EventBridge calls the internal HTTP seam with X-Job-Secret."""
    monkeypatch.setenv("JOB_SECRET", "correct-test-job-secret")
    monkeypatch.setattr(
        "app.daily_reports.router.run_daily_cashbook",
        lambda *_args, **_kwargs: pytest.fail("daily job should not run without the shared secret"),
        raising=False,
    )
    client = _client()

    missing = client.post("/internal/jobs/daily-cashbook")
    wrong = client.post("/internal/jobs/daily-cashbook", headers={"X-Job-Secret": "wrong-secret"})

    assert missing.status_code == 401, missing.text
    assert wrong.status_code == 401, wrong.text


def test_daily_cashbook_job_runs_with_matching_secret(monkeypatch):
    monkeypatch.setenv("JOB_SECRET", "correct-test-job-secret")
    calls = []

    def fake_run_daily_cashbook(db, *, business_date):
        calls.append((db, business_date))
        return {"processed": 2, "skipped": 1}

    monkeypatch.setattr("app.daily_reports.router.run_daily_cashbook", fake_run_daily_cashbook, raising=False)
    client = _client()

    response = client.post("/internal/jobs/daily-cashbook", headers={"X-Job-Secret": "correct-test-job-secret"})

    assert response.status_code == 200, response.text
    assert response.json() == {"processed": 2, "skipped": 1}
    assert len(calls) == 1
    assert isinstance(calls[0][1], date)

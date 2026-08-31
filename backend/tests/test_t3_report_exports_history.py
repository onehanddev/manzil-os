"""T3 report downloads and history — HTTP seams for issue #11."""

import io
import uuid

import jwt as pyjwt
from openpyxl import load_workbook
import psycopg
import pytest

from conftest import TEST_DB_URL
from tests.test_master_data import _admin_token, _auth_header, _client


@pytest.fixture(autouse=True)
def _supabase_env_and_mock(monkeypatch):
    secret = "test-supabase-jwt-secret-32-chars-long!!"
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)
    monkeypatch.setenv("SUPABASE_ANON_KEY", "test-anon-key")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
    store: dict[str, tuple[str, str]] = {}
    with psycopg.connect(TEST_DB_URL, autocommit=True) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, auth_user_id FROM users WHERE mobile=%s", ("+919000000000",))
            user_id, auth_id = cursor.fetchone()
            if not auth_id:
                auth_id = str(uuid.uuid4())
                cursor.execute("UPDATE users SET auth_user_id=%s WHERE id=%s", (auth_id, user_id))
            store["+919000000000"] = (str(auth_id), "admin123")

    import app.admin.router as admin_router
    import app.auth.router as auth_router
    import app.auth.supabase_client as supabase_client

    def sign_in(mobile, password):
        entry = store.get(mobile)
        if not entry or entry[1] != password:
            return None
        auth_id, _ = entry
        token = pyjwt.encode({"sub": auth_id, "phone": mobile, "aud": "authenticated", "exp": 9999999999}, secret, algorithm="HS256")
        return {"access_token": token, "user": {"id": auth_id}}

    def create_user(mobile, password, display_name):
        if mobile in store:
            return None
        auth_id = str(uuid.uuid4())
        store[mobile] = (auth_id, password)
        return auth_id

    monkeypatch.setattr(admin_router, "supabase_create_user", create_user)
    monkeypatch.setattr(auth_router, "supabase_sign_in", sign_in)
    monkeypatch.setattr(supabase_client, "supabase_create_user", create_user)
    monkeypatch.setattr(supabase_client, "supabase_sign_in", sign_in)


def test_admin_can_download_a_styled_cashbook_xlsx(conn):
    client = _client()
    token = _admin_token(client)

    response = client.get(
        "/api/reports/cashbook?from=2099-08-01&to=2099-08-31&format=xlsx",
        headers=_auth_header(token),
    )

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert "attachment" in response.headers["content-disposition"]
    workbook = load_workbook(io.BytesIO(response.content))
    sheet = workbook.active
    assert sheet.title == "Cashbook"
    assert [cell.value for cell in sheet[1]] == [
        "Date",
        "Particulars",
        "Receipt",
        "Payment",
        "Fund / Category",
    ]
    assert sheet.freeze_panes == "A2"
    assert sheet.auto_filter.ref == sheet.dimensions
    assert sheet[1][0].fill.fgColor.rgb == "002F5496"


def test_admin_can_download_a_cashbook_pdf(conn):
    client = _client()
    token = _admin_token(client)

    response = client.get(
        "/api/reports/cashbook?from=2099-08-01&to=2099-08-31&format=pdf",
        headers=_auth_header(token),
    )

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/pdf")
    assert "attachment" in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF")


def test_export_is_saved_once_per_range_and_history_is_paginated(conn):
    client = _client()
    token = _admin_token(client)
    headers = _auth_header(token)

    first_export = client.get(
        "/api/reports/cashbook?from=2099-08-01&to=2099-08-31&format=xlsx",
        headers=headers,
    )
    second_export = client.get(
        "/api/reports/cashbook?from=2099-08-01&to=2099-08-31&format=pdf",
        headers=headers,
    )
    history = client.get("/api/reports/history?page=1", headers=headers)

    assert first_export.status_code == 200, first_export.text
    assert second_export.status_code == 200, second_export.text
    assert history.status_code == 200, history.text
    body = history.json()
    assert body["page"] == 1
    assert body["page_size"] == 10
    runs = [run for run in body["runs"] if run["from"] == "2099-08-01" and run["to"] == "2099-08-31"]
    assert len(runs) == 1
    assert runs[0]["format"] == "pdf"
    assert runs[0]["generated_by"] is not None


def test_collector_and_unauthenticated_users_cannot_download_or_view_history(conn):
    client = _client()
    admin_token = _admin_token(client)
    from tests.test_master_data import _collector_token

    collector_token = _collector_token(client, admin_token)
    assert client.get("/api/reports/cashbook?from=2099-08-01&to=2099-08-31&format=xlsx").status_code == 401
    assert client.get("/api/reports/history").status_code == 401
    assert client.get(
        "/api/reports/cashbook?from=2099-08-01&to=2099-08-31&format=pdf",
        headers=_auth_header(collector_token),
    ).status_code == 403
    assert client.get("/api/reports/history", headers=_auth_header(collector_token)).status_code == 403

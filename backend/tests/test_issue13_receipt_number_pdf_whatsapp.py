"""Issue 13 TDD - official receipt numbers, PDF, and WhatsApp delivery.

Seam: HTTP API via TestClient with Supabase JWT.
"""

import uuid
from contextlib import contextmanager
from io import BytesIO
import urllib.error

import psycopg

from conftest import TEST_DB_URL
from tests.test_issue5_receipts import _fund, _setup_flat_with_occupants
from tests.test_master_data import _admin_token, _auth_header, _client, _supabase_env_and_mock  # noqa: F401


def _create_numbered_receipt(client, token, *, business_date: str, amount: int = 1000):
    fund_id = _fund(client, token)
    flat_id, owner_id, _, _ = _setup_flat_with_occupants(client, token)
    response = client.post(
        "/api/receipts",
        headers=_auth_header(token),
        json={
            "flat_id": flat_id,
            "amount": amount,
            "business_date": business_date,
            "fund_id": fund_id,
            "payer_person_id": owner_id,
            "narration": f"ISS13-{uuid.uuid4().hex[:6]}",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_receipt_numbers_are_sequential_per_financial_year(conn):
    client = _client()
    token = _admin_token(client)

    first = _create_numbered_receipt(client, token, business_date="2026-04-01", amount=1000)
    second = _create_numbered_receipt(client, token, business_date="2026-07-15", amount=1200)
    march = _create_numbered_receipt(client, token, business_date="2026-03-31", amount=900)

    assert first["receipt_number"] == "MANZIL/26-27/00001"
    assert second["receipt_number"] == "MANZIL/26-27/00002"
    assert march["receipt_number"] == "MANZIL/25-26/00001"

    listing = client.get("/api/receipts?from=2026-04-01&to=2026-12-31", headers=_auth_header(token))
    assert listing.status_code == 200, listing.text
    listed_numbers = {receipt["receipt_number"] for receipt in listing.json()["receipts"]}
    assert {"MANZIL/26-27/00001", "MANZIL/26-27/00002"}.issubset(listed_numbers)


def test_receipt_pdf_streams_a5_pdf_with_official_number(conn):
    client = _client()
    token = _admin_token(client)
    receipt = _create_numbered_receipt(client, token, business_date="2027-04-02", amount=2345)

    response = client.get(f"/api/receipts/{receipt['id']}/pdf", headers=_auth_header(token))

    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/pdf"
    assert "attachment" in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF")
    assert receipt["receipt_number"].encode() in response.content

    public_missing_token = client.get(f"/receipts/{receipt['id']}/pdf")
    assert public_missing_token.status_code == 404
    public_response = client.get(receipt["public_pdf_url"])
    assert public_response.status_code == 200, public_response.text
    assert public_response.content.startswith(b"%PDF")


def test_existing_receipts_without_token_get_public_pdf_url(conn):
    client = _client()
    token = _admin_token(client)
    created = _create_numbered_receipt(client, token, business_date="2028-01-15", amount=777)
    receipt_id = created["id"]

    with psycopg.connect(TEST_DB_URL, autocommit=True) as db:
        with db.cursor() as cur:
            cur.execute("UPDATE receipts SET public_pdf_token=NULL WHERE id=%s", (receipt_id,))

    listing = client.get("/api/receipts?from=2028-01-01&to=2028-01-31", headers=_auth_header(token))
    assert listing.status_code == 200, listing.text
    receipt = next(r for r in listing.json()["receipts"] if r["id"] == receipt_id)
    assert receipt["public_pdf_url"].startswith(f"/receipts/{receipt_id}/pdf?token=")

    public_response = client.get(receipt["public_pdf_url"])
    assert public_response.status_code == 200, public_response.text
    assert public_response.content.startswith(b"%PDF")


def test_receipt_exposes_whatsapp_status_and_resend_logs_again_in_test_mode(conn, monkeypatch):
    client = _client()
    token = _admin_token(client)
    monkeypatch.setattr("app.notifications.provider._ENV_PATHS", [])
    receipt = _create_numbered_receipt(client, token, business_date="2027-05-05", amount=1500)

    detail = client.get(f"/api/receipts/{receipt['id']}", headers=_auth_header(token))
    assert detail.status_code == 200, detail.text
    assert detail.json()["whatsapp_status"] == "LOGGED"
    assert detail.json()["whatsapp_failure_reason"] is None

    resend = client.post(f"/api/receipts/{receipt['id']}/whatsapp-resend", headers=_auth_header(token))
    assert resend.status_code == 201, resend.text
    assert resend.json()["status"] == "LOGGED"
    assert resend.json()["provider_mode"] == "test"

    notifications = client.get("/api/notifications", headers=_auth_header(token))
    matching = [n for n in notifications.json()["notifications"] if n["receipt_id"] == receipt["id"]]
    assert len(matching) == 2


def test_live_whatsapp_mode_sends_receipt_to_configured_test_number(conn, monkeypatch):
    client = _client()
    token = _admin_token(client)
    sent_requests = []

    monkeypatch.setenv("PROVIDER_MODE", "live")
    monkeypatch.setenv("WHATSAPP_TOKEN", "test-meta-token")
    monkeypatch.setenv("WHATSAPP_PHONE_ID", "1234567890")
    monkeypatch.setenv("WHATSAPP_TEMPLATE_NAME", "maintenance_receipt")
    monkeypatch.setenv("WHATSAPP_TEMPLATE_LANG", "en_US")
    monkeypatch.setenv("WHATSAPP_TEST_TO", "919876543210")

    class _Response:
        def read(self):
            return b'{"messages":[{"id":"wamid.TEST_RECEIPT"}]}'

    @contextmanager
    def _mock_urlopen(request, timeout, context=None):
        sent_requests.append((request, timeout))
        yield _Response()

    monkeypatch.setattr("urllib.request.urlopen", _mock_urlopen)

    receipt = _create_numbered_receipt(client, token, business_date="2027-06-06", amount=1800)

    assert receipt["whatsapp_status"] == "SENT"
    assert len(sent_requests) == 1
    request, timeout = sent_requests[0]
    assert request.full_url == "https://graph.facebook.com/v20.0/1234567890/messages"
    assert timeout == 10
    assert request.headers["Authorization"] == "Bearer test-meta-token"
    assert b'"to": "919876543210"' in request.data
    assert b'"name": "maintenance_receipt"' in request.data

    notifications = client.get("/api/notifications", headers=_auth_header(token))
    matching = [n for n in notifications.json()["notifications"] if n["receipt_id"] == receipt["id"]]
    assert matching[-1]["provider_mode"] == "live"
    assert matching[-1]["provider_message_id"] == "wamid.TEST_RECEIPT"


def test_live_whatsapp_mode_reads_backend_env_file_and_logs_success(conn, monkeypatch, tmp_path, capsys):
    client = _client()
    token = _admin_token(client)
    sent_requests = []

    for key in (
        "PROVIDER_MODE",
        "WHATSAPP_TOKEN",
        "WHATSAPP_PHONE_ID",
        "WHATSAPP_TEMPLATE_NAME",
        "WHATSAPP_TEMPLATE_LANG",
        "WHATSAPP_TEST_TO",
    ):
        monkeypatch.delenv(key, raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text(
        '\n'.join(
            [
                'PROVIDER_MODE="live"',
                'WHATSAPP_TOKEN="test-meta-token"',
                'WHATSAPP_PHONE_ID="1234567890"',
                'WHATSAPP_TEMPLATE_NAME="maintenance_receipt"',
                'WHATSAPP_TEMPLATE_LANG="en_US"',
                'WHATSAPP_TEST_TO="919876543210"',
            ]
        )
    )
    monkeypatch.setattr("app.notifications.provider._ENV_PATHS", [env_file])

    class _Response:
        def read(self):
            return b'{"messages":[{"id":"wamid.TEST_RECEIPT"}]}'

    @contextmanager
    def _mock_urlopen(request, timeout, context=None):
        sent_requests.append((request, timeout))
        yield _Response()

    monkeypatch.setattr("urllib.request.urlopen", _mock_urlopen)

    receipt = _create_numbered_receipt(client, token, business_date="2027-06-09", amount=1800)

    assert receipt["whatsapp_status"] == "SENT"
    assert b'"to": "919876543210"' in sent_requests[0][0].data
    out = capsys.readouterr().out
    assert "[live] WhatsApp SENT" in out
    assert "wamid.TEST_RECEIPT" in out


def test_live_whatsapp_mode_uses_certifi_ssl_context(conn, monkeypatch):
    client = _client()
    token = _admin_token(client)
    ssl_context = object()
    sent_contexts = []

    monkeypatch.setenv("PROVIDER_MODE", "live")
    monkeypatch.setenv("WHATSAPP_TOKEN", "test-meta-token")
    monkeypatch.setenv("WHATSAPP_PHONE_ID", "1234567890")
    monkeypatch.setenv("WHATSAPP_TEMPLATE_NAME", "maintenance_receipt")
    monkeypatch.setenv("WHATSAPP_TEST_TO", "919876543210")
    monkeypatch.setattr("app.notifications.provider._ENV_PATHS", [])
    monkeypatch.setattr("app.notifications.provider._ssl_context", lambda: ssl_context)

    class _Response:
        def read(self):
            return b'{"messages":[{"id":"wamid.TEST_RECEIPT"}]}'

    @contextmanager
    def _mock_urlopen(request, timeout, context=None):
        sent_contexts.append(context)
        yield _Response()

    monkeypatch.setattr("urllib.request.urlopen", _mock_urlopen)

    receipt = _create_numbered_receipt(client, token, business_date="2027-06-10", amount=1800)

    assert receipt["whatsapp_status"] == "SENT"
    assert sent_contexts == [ssl_context]


def test_live_whatsapp_mode_sends_receipt_to_payer_mobile_without_test_override(conn, monkeypatch):
    client = _client()
    token = _admin_token(client)
    sent_requests = []

    monkeypatch.setenv("PROVIDER_MODE", "live")
    monkeypatch.setenv("WHATSAPP_TOKEN", "test-meta-token")
    monkeypatch.setenv("WHATSAPP_PHONE_ID", "1234567890")
    monkeypatch.setenv("WHATSAPP_TEMPLATE_NAME", "maintenance_receipt")
    monkeypatch.delenv("WHATSAPP_TEST_TO", raising=False)
    monkeypatch.setattr("app.notifications.provider._ENV_PATHS", [])

    class _Response:
        def read(self):
            return b'{"messages":[{"id":"wamid.PAYER_RECEIPT"}]}'

    @contextmanager
    def _mock_urlopen(request, timeout, context=None):
        sent_requests.append((request, timeout))
        yield _Response()

    monkeypatch.setattr("urllib.request.urlopen", _mock_urlopen)

    fund_id = _fund(client, token)
    flat_id, owner_id, _, _ = _setup_flat_with_occupants(client, token)
    with psycopg.connect(TEST_DB_URL, autocommit=True) as db:
        with db.cursor() as cur:
            cur.execute("UPDATE persons SET mobile=%s WHERE id=%s", ("+91 98765 43210", owner_id))

    response = client.post(
        "/api/receipts",
        headers=_auth_header(token),
        json={
            "flat_id": flat_id,
            "amount": 1900,
            "business_date": "2027-06-07",
            "fund_id": fund_id,
            "payer_person_id": owner_id,
            "narration": f"ISS13-{uuid.uuid4().hex[:6]}",
        },
    )

    assert response.status_code == 201, response.text
    assert response.json()["whatsapp_status"] == "SENT"
    assert b'"to": "919876543210"' in sent_requests[0][0].data


def test_live_whatsapp_failure_logs_meta_error_body(conn, monkeypatch, _supabase_env_and_mock):
    client = _client()
    token = _admin_token(client)

    monkeypatch.setenv("PROVIDER_MODE", "live")
    monkeypatch.setenv("WHATSAPP_TOKEN", "test-meta-token")
    monkeypatch.setenv("WHATSAPP_PHONE_ID", "1234567890")
    monkeypatch.setenv("WHATSAPP_TEMPLATE_NAME", "maintenance_receipt")
    monkeypatch.setenv("WHATSAPP_TEMPLATE_LANG", "en_US")
    monkeypatch.setenv("WHATSAPP_TEST_TO", "919876543210")

    def _mock_urlopen(request, timeout, context=None):
        raise urllib.error.HTTPError(
            request.full_url,
            400,
            "Bad Request",
            hdrs=None,
            fp=BytesIO(
                b'{"error":{"message":"Template name does not exist in the translation",'
                b'"type":"OAuthException","code":132001,"fbtrace_id":"TRACE123"}}'
            ),
        )

    monkeypatch.setattr("urllib.request.urlopen", _mock_urlopen)

    receipt = _create_numbered_receipt(client, token, business_date="2027-06-08", amount=2100)

    assert receipt["whatsapp_status"] == "FAILED"
    assert "Template name does not exist" in receipt["whatsapp_failure_reason"]
    assert "TRACE123" in receipt["whatsapp_failure_reason"]

    notifications = client.get("/api/notifications", headers=_auth_header(token))
    matching = [n for n in notifications.json()["notifications"] if n["receipt_id"] == receipt["id"]]
    assert matching[-1]["status"] == "FAILED"
    assert "Template name does not exist" in matching[-1]["failure_reason"]

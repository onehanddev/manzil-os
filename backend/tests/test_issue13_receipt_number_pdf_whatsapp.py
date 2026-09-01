"""Issue 13 TDD - official receipt numbers, PDF, and WhatsApp delivery.

Seam: HTTP API via TestClient with Supabase JWT.
"""

import uuid

import psycopg

from conftest import TEST_DB_URL
from tests.test_issue5_receipts import _fund, _setup_flat_with_occupants, _supabase_env_and_mock  # noqa: F401
from tests.test_master_data import _admin_token, _auth_header, _client


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


def test_receipt_exposes_whatsapp_status_and_resend_logs_again_in_test_mode(conn):
    client = _client()
    token = _admin_token(client)
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

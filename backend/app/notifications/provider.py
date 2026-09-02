"""Notification provider abstraction – toggleable test vs live.

Issue 5: PROVIDER_MODE env flips without code change.
  - test: TestNotificationProvider logs to DB `notifications` (in-app) and stdout, no external call.
  - live: LiveWhatsAppProvider stub (implemented later) – same interface.

Also ReceiptRenderer stub: HTML in test, PDF later.
"""

from __future__ import annotations

import json
import os
import pathlib
import re
import ssl
import uuid
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from datetime import date

from sqlalchemy.orm import Session

from app.models import Notification


_ENV_PATHS = [
    pathlib.Path(__file__).resolve().parents[2] / ".env",
    pathlib.Path(__file__).resolve().parents[3] / ".env",
]


def _get_env(name: str, default: str | None = None) -> str | None:
    val = os.environ.get(name)
    if val:
        val = val.strip().strip('"').strip("'")
        if val:
            return val
    for env_path in _ENV_PATHS:
        try:
            if not env_path.exists():
                continue
            for line in env_path.read_text().splitlines():
                line = line.strip()
                if not line or line.startswith("#") or not line.startswith(name):
                    continue
                key, _, raw = line.partition("=")
                if key.strip() != name:
                    continue
                candidate = raw.strip().strip('"').strip("'")
                if candidate and not candidate.startswith("#"):
                    return candidate
        except OSError:
            continue
    return default


def _ssl_context() -> ssl.SSLContext:
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


class NotificationProvider(ABC):
    @abstractmethod
    def send_receipt_notification(
        self,
        *,
        db: Session,
        society_id: uuid.UUID,
        receipt_id: uuid.UUID,
        payer_person_id: uuid.UUID | None,
        flat_id: uuid.UUID,
        business_date: date,
        amount: float,
        narration: str | None,
        receipt_number: str | None = None,
        flat_number: str | None = None,
        society_name: str | None = None,
        payer_mobile: str | None = None,
        pdf_url: str | None = None,
    ) -> Notification:
        ...


class TestNotificationProvider(NotificationProvider):
    """Logs to DB `notifications` + stdout, no external WhatsApp call."""

    def send_receipt_notification(
        self,
        *,
        db: Session,
        society_id: uuid.UUID,
        receipt_id: uuid.UUID,
        payer_person_id: uuid.UUID | None,
        flat_id: uuid.UUID,
        business_date: date,
        amount: float,
        narration: str | None,
        receipt_number: str | None = None,
        flat_number: str | None = None,
        society_name: str | None = None,
        payer_mobile: str | None = None,
        pdf_url: str | None = None,
    ) -> Notification:
        msg = f"[test] receipt {receipt_number or receipt_id} flat {flat_number or flat_id} amount {amount} narration={narration or ''} pdf={pdf_url or ''}"
        # stdout log for observability
        print(msg)
        n = Notification(
            id=uuid.uuid4(),
            society_id=society_id,
            receipt_id=receipt_id,
            payer_person_id=payer_person_id,
            flat_id=flat_id,
            channel="WHATSAPP",
            provider_mode="test",
            status="LOGGED",
            message=msg,
            business_date=business_date,
        )
        db.add(n)
        db.flush()
        return n


class LiveWhatsAppProvider(NotificationProvider):
    """Meta WhatsApp Cloud API sender for receipt utility templates."""

    def _meta_phone_number(self, value: str | None) -> str:
        return re.sub(r"\D", "", value or "")

    def send_receipt_notification(
        self,
        *,
        db: Session,
        society_id: uuid.UUID,
        receipt_id: uuid.UUID,
        payer_person_id: uuid.UUID | None,
        flat_id: uuid.UUID,
        business_date: date,
        amount: float,
        narration: str | None,
        receipt_number: str | None = None,
        flat_number: str | None = None,
        society_name: str | None = None,
        payer_mobile: str | None = None,
        pdf_url: str | None = None,
    ) -> Notification:
        token = _get_env("WHATSAPP_TOKEN")
        phone_id = _get_env("WHATSAPP_PHONE_ID")
        template_name = _get_env("WHATSAPP_TEMPLATE_NAME")
        template_lang = _get_env("WHATSAPP_TEMPLATE_LANG", "en_US")
        to_number = self._meta_phone_number(
            _get_env("WHATSAPP_TEST_TO") or payer_mobile
        )
        msg = f"[live] receipt {receipt_number or receipt_id} flat {flat_number or flat_id} amount {amount}"
        status = "SENT"
        provider_message_id = None
        failure_reason = None
        body = {
            "messaging_product": "whatsapp",
            "to": to_number,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": template_lang},
                "components": [
                    {
                        "type": "body",
                        "parameters": [
                            {"type": "text", "text": receipt_number or str(receipt_id)},
                            {"type": "text", "text": flat_number or str(flat_id)},
                            {"type": "text", "text": f"Rs. {amount:,.2f}"},
                            {"type": "text", "text": business_date.isoformat()},
                            {"type": "text", "text": society_name or "Society"},
                        ],
                    }
                ],
            },
        }
        if pdf_url:
            body["template"]["components"].append(
                {"type": "button", "sub_type": "url", "index": "0", "parameters": [{"type": "text", "text": pdf_url}]}
            )
        try:
            req = urllib.request.Request(
                f"https://graph.facebook.com/v20.0/{phone_id}/messages",
                data=json.dumps(body).encode("utf-8"),
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10, context=_ssl_context()) as response:
                data = json.loads(response.read().decode("utf-8") or "{}")
                provider_message_id = (data.get("messages") or [{}])[0].get("id")
                print(
                    f"[live] WhatsApp SENT receipt={receipt_number or receipt_id} "
                    f"to={to_number} provider_message_id={provider_message_id or ''}"
                )
        except urllib.error.HTTPError as error:
            status = "FAILED"
            response_body = error.read().decode("utf-8", errors="replace")
            failure_reason = f"HTTP {error.code}: {response_body}" if response_body else str(error)
            msg = f"{msg} failed: {failure_reason}"
            print(
                f"[live] WhatsApp FAILED receipt={receipt_number or receipt_id} "
                f"to={to_number} reason={failure_reason}"
            )
        except (urllib.error.URLError, TimeoutError, ValueError) as error:
            status = "FAILED"
            failure_reason = str(error)
            msg = f"{msg} failed: {failure_reason}"
            print(
                f"[live] WhatsApp FAILED receipt={receipt_number or receipt_id} "
                f"to={to_number} reason={failure_reason}"
            )
        n = Notification(
            id=uuid.uuid4(),
            society_id=society_id,
            receipt_id=receipt_id,
            payer_person_id=payer_person_id,
            flat_id=flat_id,
            channel="WHATSAPP",
            provider_mode="live",
            status=status,
            message=msg,
            provider_message_id=provider_message_id,
            failure_reason=failure_reason,
            business_date=business_date,
        )
        db.add(n)
        db.flush()
        return n


def get_notification_provider() -> NotificationProvider:
    mode = (_get_env("PROVIDER_MODE", "test") or "test").strip().lower()
    has_whatsapp_credentials = all(
        _get_env(key) for key in ("WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID", "WHATSAPP_TEMPLATE_NAME")
    )
    if mode == "live" and has_whatsapp_credentials:
        return LiveWhatsAppProvider()
    return TestNotificationProvider()


# ---- Receipt renderer stub ----


class ReceiptRenderer(ABC):
    @abstractmethod
    def render(self, receipt_id: uuid.UUID) -> str:
        ...


class TestReceiptRenderer(ReceiptRenderer):
    def render(self, receipt_id: uuid.UUID) -> str:
        return f"<html><body>Receipt {receipt_id} – test stub</body></html>"


class LiveReceiptRenderer(ReceiptRenderer):
    def render(self, receipt_id: uuid.UUID) -> str:
        # PDF generation later – same stub for now
        return f"<html><body>Receipt {receipt_id} – live stub (PDF pending)</body></html>"


def get_receipt_renderer() -> ReceiptRenderer:
    mode = (_get_env("PROVIDER_MODE", "test") or "test").strip().lower()
    if mode == "live":
        return LiveReceiptRenderer()
    return TestReceiptRenderer()

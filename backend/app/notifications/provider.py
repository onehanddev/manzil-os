"""Notification provider abstraction – toggleable test vs live.

Issue 5: PROVIDER_MODE env flips without code change.
  - test: TestNotificationProvider logs to DB `notifications` (in-app) and stdout, no external call.
  - live: LiveWhatsAppProvider stub (implemented later) – same interface.

Also ReceiptRenderer stub: HTML in test, PDF later.
"""

from __future__ import annotations

import os
import uuid
from abc import ABC, abstractmethod
from datetime import date

from sqlalchemy.orm import Session

from app.models import Notification


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
    ) -> Notification:
        msg = f"[test] receipt {receipt_id} flat {flat_id} amount {amount} narration={narration or ''}"
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
    """Stub for production – real WhatsApp call will be added later. Same toggle interface."""

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
    ) -> Notification:
        msg = f"[live-stub] receipt {receipt_id} would send WhatsApp to payer {payer_person_id}"
        print(msg)
        n = Notification(
            id=uuid.uuid4(),
            society_id=society_id,
            receipt_id=receipt_id,
            payer_person_id=payer_person_id,
            flat_id=flat_id,
            channel="WHATSAPP",
            provider_mode="live",
            status="LOGGED",
            message=msg,
            business_date=business_date,
        )
        db.add(n)
        db.flush()
        return n


def get_notification_provider() -> NotificationProvider:
    mode = os.environ.get("PROVIDER_MODE", "test").strip().lower()
    if mode == "live":
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
    mode = os.environ.get("PROVIDER_MODE", "test").strip().lower()
    if mode == "live":
        return LiveReceiptRenderer()
    return TestReceiptRenderer()

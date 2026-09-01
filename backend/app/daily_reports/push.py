"""Web Push delivery with a safe no-credential fallback for local development."""

from __future__ import annotations

import json
import logging
import os

from app.models import PushSubscription

logger = logging.getLogger(__name__)


def vapid_public_key() -> str | None:
    return os.environ.get("VAPID_PUBLIC_KEY") or None


def send(subscription: PushSubscription, payload: dict) -> bool:
    """Attempt Web Push without allowing unavailable credentials to break reports."""
    public_key = vapid_public_key()
    private_key = os.environ.get("VAPID_PRIVATE_KEY")
    subject = os.environ.get("VAPID_SUBJECT")
    if not (public_key and private_key and subject):
        logger.info("daily report push logged only: VAPID credentials unavailable")
        return False
    try:
        from pywebpush import webpush

        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            data=json.dumps(payload),
            vapid_private_key=private_key,
            vapid_claims={"sub": subject},
        )
    except Exception:
        logger.exception("daily report push failed")
        return False
    return True

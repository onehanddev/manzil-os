"""Meta WhatsApp Cloud API webhook – verification + event receiver.

Meta portal asks for:
  Callback URL  -> https://<your-public-host>/api/webhooks/whatsapp
  Verify Token  -> any string you choose (must match WHATSAPP_VERIFY_TOKEN)

Flow:
  1. You paste Callback URL + Verify Token into Meta App Dashboard
     WhatsApp > Configuration > Webhook > Edit.
  2. Meta sends GET /api/webhooks/whatsapp?hub.mode=subscribe
        &hub.verify_token=<token>&hub.challenge=<challenge>
  3. This endpoint echoes `hub.challenge` as text/plain 200 if token matches,
     else 403. Meta then marks the webhook as verified.
  4. Afterwards Meta POSTs message/status events to the same URL.

Local dev: Meta requires public HTTPS, so expose localhost via ngrok/cloudflared:
  ngrok http 8000
  # then use https://<id>.ngrok-free.app/api/webhooks/whatsapp as Callback URL

Supabase alternative: if you prefer Supabase Edge Functions, the equivalent
URL after `supabase functions deploy whatsapp-webhook` is:
  https://<project-ref>.supabase.co/functions/v1/whatsapp-webhook
See supabase/functions/whatsapp-webhook/index.ts scaffold.

Env:
  WHATSAPP_VERIFY_TOKEN – token you chose for Meta portal (required for verification)
  WHATSAPP_APP_SECRET   – Meta App Secret (optional, enables X-Hub-Signature-256 check)
"""

import hashlib
import hmac
import os

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Notification

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])

# Map Meta status -> our notification.status (upper-cased, constrained)
_STATUS_MAP = {
    "sent": "SENT",
    "delivered": "DELIVERED",
    "read": "READ",
    "failed": "FAILED",
    "deleted": "FAILED",
}


def _extract_statuses(payload: dict) -> list[dict]:
    """Flatten Meta's nested entry[].changes[].value.statuses[] into a list."""
    statuses: list[dict] = []
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            for s in value.get("statuses") or []:
                if isinstance(s, dict) and s.get("id"):
                    statuses.append(s)
            # Some test payloads send value directly as status dict
            if isinstance(value.get("status"), str) and value.get("id"):
                statuses.append(value)
    # Fallback: payload itself is a status (used in unit tests)
    if not statuses and payload.get("id") and payload.get("status"):
        statuses.append(payload)
    return statuses


def _get_verify_token() -> str | None:
    val = os.environ.get("WHATSAPP_VERIFY_TOKEN")
    if val:
        return val.strip().strip('"').strip("'")
    # fallback: read backend/.env directly without requiring restart/export
    try:
        import pathlib

        env_path = pathlib.Path(__file__).parent.parent.parent / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                s = line.strip()
                if s.startswith("WHATSAPP_VERIFY_TOKEN"):
                    _, _, v = s.partition("=")
                    cand = v.strip().strip('"').strip("'")
                    if cand and not cand.startswith("#"):
                        return cand
    except Exception:
        pass
    return None


def _get_app_secret() -> str | None:
    val = os.environ.get("WHATSAPP_APP_SECRET")
    if val:
        return val.strip().strip('"').strip("'")
    try:
        import pathlib

        env_path = pathlib.Path(__file__).parent.parent.parent / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                s = line.strip()
                if s.startswith("WHATSAPP_APP_SECRET"):
                    _, _, v = s.partition("=")
                    cand = v.strip().strip('"').strip("'")
                    if cand and not cand.startswith("#"):
                        return cand
    except Exception:
        pass
    return None


@router.get("/whatsapp")
async def whatsapp_verify(request: Request):
    """Handle Meta's GET verification handshake."""
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    expected = _get_verify_token()

    # No token configured -> give helpful 500 so user knows to set env
    if not expected:
        return PlainTextResponse(
            "WHATSAPP_VERIFY_TOKEN not configured on server. Set it in backend/.env then restart.",
            status_code=500,
        )

    if mode == "subscribe" and token == expected and challenge is not None:
        # Must return challenge as raw text/plain, no JSON wrapper
        return PlainTextResponse(content=challenge, status_code=200)

    return PlainTextResponse(content="Forbidden", status_code=403)


@router.post("/whatsapp")
async def whatsapp_events(request: Request, db: Session = Depends(get_db)):
    """Receive Meta POST events (messages, statuses). Always 200 quickly."""
    body = await request.body()

    # Optional signature verification – if APP_SECRET is set, reject bad sig
    app_secret = _get_app_secret()
    if app_secret:
        sig = request.headers.get("x-hub-signature-256", "")
        if sig.startswith("sha256="):
            expected_sig = "sha256=" + hmac.new(app_secret.encode(), body, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected_sig, sig):
                return Response(content="Invalid signature", status_code=403)

    # Parse JSON (Meta nests 4 deep: entry[].changes[].value)
    try:
        import json

        payload = json.loads(body) if body else {}
    except Exception:
        payload = {}

    try:
        print(f"[whatsapp webhook] received: {payload}")
    except Exception:
        pass

    # Persist status callbacks: match provider_message_id (wamid) -> notifications row
    try:
        for s in _extract_statuses(payload):
            wamid = s.get("id")
            raw_status = (s.get("status") or "").lower()
            mapped = _STATUS_MAP.get(raw_status)
            if not wamid or not mapped:
                continue
            failure_reason = None
            if mapped == "FAILED":
                errors = s.get("errors") or []
                if errors and isinstance(errors, list):
                    e = errors[0] or {}
                    # Prefer Meta's title/detail, fall back to code
                    title = e.get("title") or e.get("detail") or e.get("error_data", {}).get("details")
                    code = e.get("code")
                    detail = e.get("href") or ""
                    parts = [p for p in [title, f"code {code}" if code else None, detail] if p]
                    failure_reason = " | ".join(str(p) for p in parts) or str(e)
                else:
                    failure_reason = s.get("errors") or s.get("failure_reason") or "failed"

            row = db.execute(
                select(Notification).where(Notification.provider_message_id == wamid)
            ).scalars().first()
            if not row:
                print(f"[whatsapp webhook] no notification for wamid={wamid} status={raw_status}")
                continue
            # Don't downgrade READ/DELIVERED -> SENT, but always allow FAILED
            rank = {"LOGGED": 0, "SENT": 1, "DELIVERED": 2, "READ": 3, "FAILED": 99}
            current_rank = rank.get(row.status, -1)
            new_rank = rank.get(mapped, -1)
            should_update = mapped == "FAILED" or new_rank > current_rank
            if should_update:
                row.status = mapped  # type: ignore[assignment]
                if failure_reason:
                    row.failure_reason = failure_reason  # type: ignore[assignment]
                print(f"[whatsapp webhook] updated wamid={wamid} -> {mapped} failure={failure_reason or ''}")
        db.commit()
    except Exception as e:
        # Never fail the webhook – log and still return 200 so Meta stops retrying
        try:
            print(f"[whatsapp webhook] persist error: {e}")
            db.rollback()
        except Exception:
            pass

    # Meta expects 200 within ~3s; do not block on heavy work here – enqueue instead.
    return Response(content="EVENT_RECEIVED", status_code=200)

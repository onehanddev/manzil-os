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

from fastapi import APIRouter, Request, Response
from fastapi.responses import PlainTextResponse

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


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
async def whatsapp_events(request: Request):
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
        # If header missing but secret is set, we still accept (some test tools omit it)
        # To enforce strictly, uncomment:
        # else:
        #     return Response(content="Missing signature", status_code=403)

    # Parse JSON (Meta nests 4 deep: entry[].changes[].value)
    try:
        import json

        payload = json.loads(body) if body else {}
    except Exception:
        payload = {}

    # Minimal logging – replace with your business logic (save to DB, reply via Graph API, etc.)
    # For now we just acknowledge; inspect payload in server logs if needed.
    try:
        print(f"[whatsapp webhook] received: {payload}")
    except Exception:
        pass

    # Meta expects 200 within ~3s; do not block on heavy work here – enqueue instead.
    return Response(content="EVENT_RECEIVED", status_code=200)

// Meta WhatsApp Cloud API webhook – Supabase Edge Function
// This is the URL Meta will call. After deploy it is:
//   https://<project-ref>.supabase.co/functions/v1/whatsapp-webhook
//
// Meta portal fields:
//   Callback URL  = https://<project-ref>.supabase.co/functions/v1/whatsapp-webhook
//   Verify Token  = value of WHATSAPP_VERIFY_TOKEN env / secret
//
// Also available via FastAPI for local dev:
//   http://localhost:8000/api/webhooks/whatsapp  (see backend/app/webhooks/router.py)

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";

async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  if (!signature.startsWith("sha256=")) return false;
  const sigHex = signature.slice(7);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  // constant-time compare
  if (hex.length !== sigHex.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ sigHex.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // --- GET verification handshake ---
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (!VERIFY_TOKEN) {
      return new Response("WHATSAPP_VERIFY_TOKEN not configured on Edge Function secrets", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      });
    }

    if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
      // Must return challenge as raw text/plain, not JSON
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    return new Response("Forbidden", { status: 403, headers: { "Content-Type": "text/plain" } });
  }

  // --- POST event delivery ---
  if (req.method === "POST") {
    const body = await req.text();

    if (APP_SECRET) {
      const sig = req.headers.get("x-hub-signature-256") ?? "";
      if (sig) {
        const ok = await verifySignature(body, sig, APP_SECRET);
        if (!ok) return new Response("Invalid signature", { status: 403 });
      }
    }

    let payload: unknown = null;
    try {
      payload = body ? JSON.parse(body) : null;
    } catch {
      payload = null;
    }

    console.log("[whatsapp-webhook] received:", JSON.stringify(payload));

    // TODO: add business logic here – persist to DB, call Graph API to reply, etc.
    // Example: forward to your FastAPI or insert into Supabase table.

    return new Response("EVENT_RECEIVED", { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  return new Response("Method Not Allowed", { status: 405 });
});

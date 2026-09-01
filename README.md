# Manzil OS – Phase 0 Pilot

Mobile-first PWA + FastAPI + PostgreSQL for society cashbook (opening cash → maintenance receipts → expenses → closing cash). See `PHASE_0_PRD.md` for scope and `PHASE_0_ISSUES.md` for the tracer-bullet backlog.

## Stack

- **Backend:** FastAPI + SQLAlchemy + Alembic + PostgreSQL + Supabase Auth (JWT). Notification provider toggle (`PROVIDER_MODE=test|live`).
- **Frontend:** React 19 + Vite + Tailwind 4 + TanStack Query + Zustand + React Router + Supabase-js (auth only). PWA installable, 360px/390px checked. The PWA is served at `https://app.manzilos.com`; the marketing site is on the root domain.
- **Seed:** deterministic fixtures (`backend/app/seed.py` + `backend/seed.sql`), idempotent.

## Quick start (local demo without real WhatsApp/OTP)

### 1. Backend – DB + auth env

```bash
# from repo root
cp backend/.env.example backend/.env
# edit DATABASE_URL if needed (default: postgresql://hakimuddinhaweliwala@localhost:5432/manzil_os)
# PROVIDER_MODE=test is the default – demo logs to DB, no external call

# create DB if missing
psql -h localhost -U hakimuddinhaweliwala -d postgres -c "CREATE DATABASE manzil_os;"
psql -h localhost -U hakimuddinhaweliwala -d postgres -c "CREATE DATABASE manzil_os_test;"

# migrate both DBs
cd backend
uv run alembic upgrade head
TEST_DATABASE_URL="postgresql://hakimuddinhaweliwala@localhost:5432/manzil_os_test" uv run alembic upgrade head

# optional local Supabase (no Twilio – OTP is always 123456)
npx supabase start            # from repo root, needs supabase/config.toml
bash scripts/sync-supabase-env.sh   # syncs SUPABASE_* into backend/.env + frontend/.env
```

`.env` keys (see `backend/.env.example`):
- `DATABASE_URL` – primary DB
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` – from `npx supabase status -o env` (or hosted dashboard)
- `PROVIDER_MODE=test|live` – **test** logs receipts to `notifications` + stdout; **live** calls Meta WhatsApp Cloud API
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANG` – Meta Cloud API sending config for live mode
- `WHATSAPP_TEST_TO` – optional setup safety override; send all receipt WhatsApps to your Meta test recipient before using payer mobiles
- `WHATSAPP_VERIFY_TOKEN` – webhook verification only

### 2. Seed demo fixture (repeatable, idempotent)

```bash
# from backend/
uv run python -m app.seed
# shim alias also works from repo root:
uv run python -m backend.seed
# or via SQL (no Python):
psql -h localhost -U hakimuddinhaweliwala -d manzil_os -f backend/seed.sql
```

What it creates (deterministic UUIDs, safe to rerun):
- 1 society (Manzil Pilot Society)
- 2 flat categories (1 BHK, 2 BHK)
- 8 flats `DEMO-A101..A108` with varied `opening_due` (2000, 0, 500, 2000, 1500, 500, 2000, 0)
- 12 POCs (tenant-default + owner-fallback cases per flat)
- Opening dues above
- 6 receipts `DEMO-SEED …` – one advance produces `current_due = -500`, one zero-clear produces `0` (see `current_due = opening - sum(posted receipts)`)
- Admin (`+919000000000`) + Collector (`+919000000100`) users and active memberships
- `notifications` rows with `provider_mode=test, status=LOGGED` (proves `PROVIDER_MODE=test` path)

Verify after seed:

```bash
uv run python -m app.seed   # second run – counts unchanged (idempotent)

# API probes (token via login; demo token also works if Supabase running)
curl -s -H "Authorization: Bearer <ADMIN_JWT>" http://localhost:8000/api/flats?with_dues=true | jq '.flats[] | select(.flat_number|startswith("DEMO-")) | "\(.flat_number) \(.current_due)"'
# → DEMO-A102 -500  (advance) , DEMO-A103 0 (clear) etc.

curl -s -H "Authorization: Bearer <ADMIN_JWT>" http://localhost:8000/api/reports/flat-dues.xlsx -o /tmp/flat-dues.xlsx
# open in Excel – check -500 and 0 rows

# ledger
curl -s -H "Authorization: Bearer <ADMIN_JWT>" http://localhost:8000/api/flats/<id>/ledger | jq .
```

### 3. Run the apps

```bash
# backend (from backend/)
uv run dev                    # FastAPI on http://127.0.0.1:8000  (or PORT=8001 uv run dev)
curl http://127.0.0.1:8000/health

# frontend (from frontend/)
npm install
cp .env.example .env          # already API_URL=http://localhost:8000/api, SUPABASE_URL=http://127.0.0.1:54321
npm run dev                   # Vite on http://localhost:5173
npm run build && npm run typecheck
npm test                      # Vitest + RTL + MSW
```

## Demo walkthrough (phone, 360px + 390px)

1. Login: any test number from `supabase/config.toml` (`+919000000000` / `123456` – test_otp, no real SMS) or demo mode if `VITE_SUPABASE_URL` empty.
2. **Flats** (`/flats`): categories → Create flat → Create POC → Assign to flat (try OWNER-only then OWNER+TENANT; default-payer preview shows tenant-first) → Opening Dues (varied: try 2000, 0, 500). List shows `Current Due` with advance in emerald. Ledger sheet → running due + Print. **Download Excel** → verify varied dues including `-500` and `0`.
3. **Collect** (`/receipts`): pick flat → amount prefills from category → fund (Main Fund default) → type Regular/Arrears/Part/Advance → submit (POSTED, cash only – cash-only banner visible). Recent list + Undo (void) preserves history. Admin filter by business date / flat / collector (uses `business_date`, society-scoped).
4. **Dues** = `/flats?with_dues=true` list (same page) + `/flats/:id/ledger` entries derived as `opening - sum(posted)`. No cross-society rows.
5. **Excel** = button on `/flats` → `GET /reports/flat-dues.xlsx` (also `/api/reports/...` alias) – valid openpyxl file, filtered by `is_active`.

All Phase 1 paths have explicit empty/loading/error/success states (skeleton, muted empty text, 403 copy, sonner toasts) and are usable at 360px and 390px.

### No external providers needed for demo

- `PROVIDER_MODE=test` (default) – receipts create a `notifications` row (`provider_mode=test, status=LOGGED`) and print to stdout, no WhatsApp call.
- `npx supabase start` + `test_otp: 123456` – OTP flow never touches Twilio.
- Seed is deterministic – rerun is safe; `psql -f backend/seed.sql` is equivalent to `uv run python -m app.seed`.

### Try real WhatsApp receipt delivery

Use your Meta business test number first so live receipts do not go to residents while setup is being verified.

```bash
# backend/.env
PROVIDER_MODE="live"
WHATSAPP_TOKEN="<Meta access token>"
WHATSAPP_PHONE_ID="<Meta phone number ID>"
WHATSAPP_TEMPLATE_NAME="maintenance_receipt"
WHATSAPP_TEMPLATE_LANG="en_US"
WHATSAPP_TEST_TO="91XXXXXXXXXX"
```

Restart `uv run dev`, record a receipt, then check `/api/notifications`: a successful send stores `provider_mode=live`, `status=SENT`, and Meta's `provider_message_id`. Remove `WHATSAPP_TEST_TO` only after the template is approved and payer mobile numbers include country code.

## Tests

```bash
# backend – auto-migrates manzil_os_test via tests/conftest.py
uv run pytest tests/ -v

# includes test_seed_issue7.py (idempotency + Excel varied dues) and Issue 6 flat-ledger tests
# run single seam:
uv run pytest tests/test_seed_issue7.py -v
uv run pytest tests/test_issue6_flat_ledger.py -v

# frontend
npm test && npm run build
```

## Project guidance

See `AGENTS.md` for vertical-slice + TDD rules, `CONTEXT.md` for domain language, `backend/README.md` for Alembic and migration workflow.

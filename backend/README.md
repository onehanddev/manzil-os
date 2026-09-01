# Manzil OS Backend

## Quick Start (minimal `uv` commands)

```bash
# from backend/ — starts FastAPI with reload on http://127.0.0.1:8000
uv run dev
# alternatives:
uv run python -m app          # same (uses backend/app/__main__.py:10)
PORT=8001 uv run dev          # custom port
uv run dev --port 8001        # also works (forwarded to uvicorn)

# verify
curl http://127.0.0.1:8000/health  # -> {"status":"ok","db":"ok"}
curl http://127.0.0.1:8000/docs
```

Backend port is **not** in `backend/.env` — `backend/app/__main__.py:10` reads `$PORT` else `8000` (uvicorn default). Frontend port is `frontend/vite.config.ts:57` (`5173`) with `frontend/.env:3` `API_URL=/api`.

If you saw `ASGI/SGI` or `Router.__init__() got unexpected keyword argument 'on_startup'` errors, it was from running `uvicorn app.main` (missing `:app`) or global `fastapi==0.115` instead of the venv's `0.141.1`. Always use `uv run` from `backend/`.

## Database: Test vs. Main vs. Production

You are correct about the current setup:

| Database | URL source | Purpose | Seeded? |
|---|---|---|---|
| `manzil_os_test` | `TEST_DATABASE_URL` (default `postgresql://hakimuddinhaweliwala@localhost:5432/manzil_os_test`) | Automated tests only — wiped & re-migrated on every `pytest` run via `tests/conftest.py:35` | Bootstrap reference data only |
| `manzil_os` | `DATABASE_URL` in `backend/.env` (default `postgresql://hakimuddinhaweliwala@localhost:5432/manzil_os`) | **Local dev / main DB** — your daily development, manual API testing | Bootstrap reference data only |
| Supabase/AWS (`aws-0-<region>.pooler.supabase.com:6543`) | `DATABASE_URL` when set to Supabase URL | **Production** — use the Supabase project URL when deploying | Bootstrap reference data only |

All three are the **same schema** — Alembic guarantees they stay in sync.

## How Alembic fits (replaces `init.sql`)

`backend/init.sql` was a one-shot dump: no history, no rollbacks, no way to evolve schema. Alembic is version control for the DB:

* `backend/alembic/versions/be8fc2f64365_initial_trimmed_schema.py:1` is the first commit — it ports the old `init.sql` (trimmed Phase 1: `opening_due - receipts`, no funds/charges/expenses) into a versioned migration.
* `alembic_version` table records which revision each DB is at.
* To evolve schema: `uv run alembic revision -m "add xyz"` → edit the new `versions/*.py` → `upgrade head` on every env. No more hand-editing `init.sql`.

## Complete workflow

### 0. Auth mode for the pilot

The pilot uses Supabase Auth for identity, but login is mobile + password through
the backend `/auth/login` endpoint. SMS OTP is not enabled for production and no
SMS provider is required.

The old OTP endpoints remain available for tests/local experiments only. Local
Supabase can still run deterministic test OTPs (`123456`) without Twilio if you
need to exercise that path.

`supabase/config.toml` already enables `auth.sms.test_otp` for 10 dev numbers
(`+919000000000`, `919000000100`, etc.) and a dummy Twilio provider so phone
login is not disabled. The local stack runs on:

- API/Kong: `http://127.0.0.1:54321`
- Studio: `http://127.0.0.1:54323`
- DB: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

```bash
# once: install CLI (already in devDependencies via npx)
npx supabase --version

# start local stack (first run pulls ~1.5GB of images)
npx supabase start
npx supabase status -o env   # shows ANON_KEY, SERVICE_ROLE_KEY, JWT_SECRET, etc.

# sync keys into backend/.env (or copy manually from status)
bash scripts/sync-supabase-env.sh

# optional: verify local test OTP works (should return message_id test-otp)
curl -s -X POST "http://127.0.0.1:54321/auth/v1/otp" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"phone":"+919000000000"}' | cat

# stop when done (keep with --no-backup if you want to wipe)
npx supabase stop
npx supabase stop --no-backup  # full reset
```

`scripts/sync-supabase-env.sh` rewrites `SUPABASE_URL=http://127.0.0.1:54321`
and the anon/service keys. Backups are saved as `*.bak.<timestamp>`. Backend JWT
verification in `backend/app/auth/supabase_client.py:80` handles both HS256
(hosted) and ES256 via JWKS (local), so the same code works in either env.

> Any phone listed under `[auth.sms.test_otp]` in `supabase/config.toml` always
> verifies with `123456`. Uncategorized phones will attempt real Twilio (dummy
> creds → will fail), so stick to the listed numbers for dev.

### 1. Local dev (you are here)

`backend/.env` now points to **local** `manzil_os` so `alembic` works out of the box (previously it pointed at the dead Supabase URL, hence `FATAL: tenant/user ... not found`).

```bash
# from backend/
psql -h localhost -U hakimuddinhaweliwala -d postgres -c "CREATE DATABASE manzil_os;"
uv run alembic upgrade head   # uses DATABASE_URL from .env
uv run alembic current        # -> be8fc2f64365 (head)
psql -h localhost -U hakimuddinhaweliwala -d manzil_os -c "\dt"
```

If you see “already at head”, the DB is migrated — just keep working.

### 2. Test DB (isolated, for `pytest`)

You never need to run Alembic manually for tests. `tests/conftest.py:13` does it for you:

```bash
uv run pytest tests/test_schema.py -v
# internally: DROP SCHEMA public CASCADE; CREATE SCHEMA public; DATABASE_URL=<test_db> alembic upgrade head
```

To run Alembic manually against the test DB:

```bash
DATABASE_URL="postgresql://hakimuddinhaweliwala@localhost:5432/manzil_os_test" uv run alembic upgrade head
DATABASE_URL="postgresql://hakimuddinhaweliwala@localhost:5432/manzil_os_test" uv run alembic downgrade base
```

### 3. Production Supabase setup

Create the Supabase project in the closest region available to customers. For the current pilot, do not enable SMS OTP or configure an SMS provider; admins sign in with registered mobile + password through Supabase Auth.

Collect these backend environment values from Supabase and your deploy platform:

```bash
SUPABASE_URL="https://<project-ref>.supabase.co"
SUPABASE_ANON_KEY="<anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
SUPABASE_JWT_SECRET="<jwt-secret>"
DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"
```

Run migrations from your local machine first:

```bash
DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true" uv run alembic upgrade head
```

`backend/config.py:1` and `backend/alembic/env.py:1` both strip `?pgbouncer=true` and normalize `postgresql://` → `postgresql+psycopg://` automatically.

Migrations seed only bootstrap reference data: roles, one society, flat categories, funds, vendors, and expense categories. They do not create login users, memberships, resident contacts, flats, receipts, or known passwords.

To create the first production admin:

1. In Supabase Dashboard, create an Auth user for the admin with their mobile number and password.
2. Copy the Auth user UUID.
3. Run:

```bash
psql "$DATABASE_URL" \
  -v admin_auth_user_id='<supabase-auth-user-uuid>' \
  -v admin_mobile='+919876543210' \
  -v admin_display_name='Admin Name' \
  -f backend/bootstrap_production_admin.sql
```

Only run the demo seed intentionally. Do not run `uv run python -m app.seed` or `psql -f backend/seed.sql` against production unless launching a demo society.

For AWS App Runner, use `backend/apprunner.yaml` or configure these commands in the console:

```bash
pip install uv && uv sync --frozen
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Set `JOB_SECRET` in App Runner and configure EventBridge Scheduler to call `POST /internal/jobs/daily-cashbook` with `X-Job-Secret: <JOB_SECRET>`.

### 4. Creating the next migration

```bash
uv run alembic revision -m "add xyz"
# edit backend/alembic/versions/<rev>_<slug>.py (upgrade/downgrade)
uv run alembic upgrade head          # local manzil_os
DATABASE_URL="postgresql://.../manzil_os_test" uv run alembic upgrade head  # test
# then commit the new version file — CI/prod will pick it up
```

### 5. Resetting a DB

```bash
uv run alembic downgrade base   # drops all trimmed tables, keeps alembic_version
uv run alembic upgrade head     # re-creates + re-seeds bootstrap reference data only, not users/demo rows
```

## Why `alembic upgrade head` can fail with stale Supabase URLs

If `backend/.env:1` contains a stale Supabase pooler URL, psycopg can return `FATAL: (ENOTFOUND) tenant/user ... not found` on every `alembic` run that reads `.env`. Keep local `.env` pointed at `manzil_os` for development. For production, set `DATABASE_URL` explicitly in the deployment environment — see above.

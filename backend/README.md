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

Backend port is **not** in `backend/.env` — `backend/app/__main__.py:10` reads `$PORT` else `8000` (uvicorn default). Frontend port is `frontend/vite.config.ts:57` (`5173`) with `frontend/.env:3` `VITE_API_URL=/api`.

If you saw `ASGI/SGI` or `Router.__init__() got unexpected keyword argument 'on_startup'` errors, it was from running `uvicorn app.main` (missing `:app`) or global `fastapi==0.115` instead of the venv's `0.141.1`. Always use `uv run` from `backend/`.

## Database: Test vs. Main vs. Production

You are correct about the current setup:

| Database | URL source | Purpose | Seeded? |
|---|---|---|---|
| `manzil_os_test` | `TEST_DATABASE_URL` (default `postgresql://hakimuddinhaweliwala@localhost:5432/manzil_os_test`) | Automated tests only — wiped & re-migrated on every `pytest` run via `tests/conftest.py:35` | Yes (via Alembic) |
| `manzil_os` | `DATABASE_URL` in `backend/.env` (default `postgresql://hakimuddinhaweliwala@localhost:5432/manzil_os`) | **Local dev / main DB** — your daily development, manual API testing | Yes (via Alembic) |
| Supabase/AWS (`aws-0-ap-south-1.pooler.supabase.com:6543`) | `DATABASE_URL` when set to Supabase URL | **Production** — not used locally right now; the project `zzxgefmhwnpplvpweymi` is paused/deleted (`ENOTFOUND`), so any `alembic` run against it fails | Would be seeded on `alembic upgrade head` |

All three are the **same schema** — Alembic guarantees they stay in sync.

## How Alembic fits (replaces `init.sql`)

`backend/init.sql` was a one-shot dump: no history, no rollbacks, no way to evolve schema. Alembic is version control for the DB:

* `backend/alembic/versions/be8fc2f64365_initial_trimmed_schema.py:1` is the first commit — it ports the old `init.sql` (trimmed Phase 1: `opening_due - receipts`, no funds/charges/expenses) into a versioned migration.
* `alembic_version` table records which revision each DB is at.
* To evolve schema: `uv run alembic revision -m "add xyz"` → edit the new `versions/*.py` → `upgrade head` on every env. No more hand-editing `init.sql`.

## Complete workflow

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

### 3. Production (Supabase/AWS — currently paused)

When the Supabase project is re-created or AWS RDS is ready, just point `DATABASE_URL` at it — same command:

```bash
# example (do NOT commit .env):
DATABASE_URL="postgresql://postgres.xxx:password@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true" uv run alembic upgrade head
# or: set DATABASE_URL in your deploy env / GitHub Secrets and run alembic on deploy
```

`backend/config.py:1` and `backend/alembic/env.py:1` both strip `?pgbouncer=true` and normalize `postgresql://` → `postgresql+psycopg://` automatically.

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
uv run alembic upgrade head     # re-creates + re-seeds (1 society, 2 categories, SOCIETY_ADMIN/COLLECTOR, admin user)
```

## Why `alembic upgrade head` was failing for you

`backend/.env:1` still contained the Supabase pooler URL. That project `zzxgefmhwnpplvpweymi` no longer exists, so psycopg got `FATAL: (ENOTFOUND) tenant/user ... not found` on every `alembic` run that read `.env`. Fixed by defaulting `.env` to `manzil_os` local. For production, set `DATABASE_URL` explicitly — see above.

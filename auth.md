# Auth Setup Guide — How to Add a New User (No Sign-Up UI Yet)

> **Current status:** There is no public sign-up page. Login uses `mobile + password` through Supabase Auth. Every login user must exist in **two places** that are linked together:
>
> 1. **Supabase Auth** — holds the login (phone + password) and gives a JWT.
> 2. **Your Postgres database** — holds `users`, `society_memberships`, and `membership_roles` that decide what the user can do inside the app.
>
> The link between them is `users.auth_user_id` = Supabase Auth user `id` (`sub` in the JWT). See `backend/app/auth/deps.py:22` and `backend/app/models.py:80`.

If either side is missing, login will fail with `No local mapping` or `No active membership`.

---

## What you need before you start

1. **Database is migrated.** From `backend/` run:
   ```bash
   uv run alembic upgrade head
   ```
   This creates all tables and seeds bootstrap data only (`backend/alembic/versions/be8fc2f64365_initial_trimmed_schema.py:166`):
   - 2 roles: `SOCIETY_ADMIN` and `COLLECTOR`
   - 1 society: `Manzil Pilot Society` (`00000000-0000-0000-0000-000000000001`)
   - 2 flat categories, funds, etc.
   - It does **not** create login users.

2. **You know your `DATABASE_URL`.** Local example:
   ```
   postgresql://hakimuddinhaweliwala@localhost:5432/manzil_os
   ```
   Production example (Supabase pooler):
   ```
   postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true
   ```

3. **You have Supabase access.** Either:
   - **Hosted:** Supabase Dashboard for your project.
   - **Local:** `npx supabase start` running at `http://127.0.0.1:54321` (`supabase/config.toml:154`).

---

## Step-by-step: Fresh database → working login

Let's add a new admin: `+919876543210` / password `MySecret123`

### Step 1 — Create the user in Supabase Auth

This is where the password lives. The app never stores passwords — only Supabase does (`backend/app/auth/supabase_client.py:310`).

#### Option A: Hosted Supabase Dashboard (recommended for production)

1. Open your Supabase project → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Enter:
   - **Phone:** `+919876543210` (always with `+91` / country code, no spaces)
   - **Password:** `MySecret123` (minimum 6 characters, `supabase/config.toml:180`)
   - **Auto Confirm User:** **ON** (otherwise they cannot log in until confirmed)
   - If the dashboard requires an email, use the synthetic email trick the backend uses: `919876543210@manzil.local` (`backend/app/auth/supabase_client.py:322`). You still log in with the phone number.
3. Click **Create user**.
4. Click the new row → copy the **User UID** (looks like `a1b2c3d4-...`). This is the `auth_user_id`.

#### Option B: Local Supabase (for development)

If you run `npx supabase start`, you can also create via the built-in Studio at `http://127.0.0.1:54323` the same way, or let the API do it:

```bash
# Local Supabase creates the user automatically on OTP verify in test mode
# but for password login, create via service role API or Dashboard.
```

> **Local test OTP shortcut:** Any number under `[auth.sms.test_otp]` in `supabase/config.toml:268` (e.g. `+919000000000`) always verifies with `123456` and does not need a real SMS provider. This is only for local/testing.

### Step 2 — Copy the Supabase Auth User ID

You need this UUID for the next step. Keep it handy:

```
admin_auth_user_id = a1b2c3d4-1234-5678-90ab-cdef12345678
admin_mobile       = +919876543210
admin_display_name = Admin Name
```

### Step 3 — Link that Supabase user to your app database

Run **one** of the two methods below. Both do the same three inserts: `users` → `society_memberships` → `membership_roles`.

#### Method 1: The ready-made script (easiest for the first admin)

The repo already ships this script: `backend/bootstrap_production_admin.sql:1`

```bash
psql "$DATABASE_URL" \
  -v admin_auth_user_id='a1b2c3d4-1234-5678-90ab-cdef12345678' \
  -v admin_mobile='+919876543210' \
  -v admin_display_name='Admin Name' \
  -f backend/bootstrap_production_admin.sql
```

What it does:
- Inserts/updates `users` with your `auth_user_id`, `mobile`, `display_name`.
- Creates an `ACTIVE` membership to the first society.
- Assigns the `SOCIETY_ADMIN` role.

You will see `INSERT 0 1` and `COMMIT` — no errors means success.

#### Method 2: Manual SQL (for any user, any role)

Use this when you want a `COLLECTOR` or a second admin. Change the role line at the bottom.

```sql
-- 1. Create / update the app user and link to Supabase
INSERT INTO users (id, auth_user_id, mobile, display_name)
VALUES (gen_random_uuid(), 'a1b2c3d4-1234-5678-90ab-cdef12345678'::uuid, '+919876543210', 'Admin Name')
ON CONFLICT (mobile) DO UPDATE
SET auth_user_id = EXCLUDED.auth_user_id,
    display_name = EXCLUDED.display_name;

-- 2. Give them an ACTIVE membership to the first society
WITH target_user AS (
    SELECT id FROM users WHERE mobile = '+919876543210'
), target_society AS (
    SELECT id FROM societies ORDER BY created_at ASC LIMIT 1
)
INSERT INTO society_memberships (id, user_id, society_id, status)
SELECT gen_random_uuid(), target_user.id, target_society.id, 'ACTIVE'
FROM target_user, target_society
WHERE NOT EXISTS (
    SELECT 1 FROM society_memberships existing
    WHERE existing.user_id = target_user.id
      AND existing.society_id = target_society.id
);

-- 3. Assign the role (pick one: SOCIETY_ADMIN or COLLECTOR)
WITH target_user AS (
    SELECT id FROM users WHERE mobile = '+919876543210'
), target_membership AS (
    SELECT society_memberships.id
    FROM society_memberships
    JOIN target_user ON target_user.id = society_memberships.user_id
    WHERE society_memberships.status = 'ACTIVE'
    ORDER BY society_memberships.created_at ASC
    LIMIT 1
), admin_role AS (
    SELECT id FROM roles WHERE key = 'SOCIETY_ADMIN'  -- change to 'COLLECTOR' if needed
)
INSERT INTO membership_roles (society_membership_id, role_id)
SELECT target_membership.id, admin_role.id
FROM target_membership, admin_role
ON CONFLICT DO NOTHING;
```

Run it with:

```bash
psql "$DATABASE_URL" -f your_file.sql
# or paste directly into psql / Supabase SQL Editor
```

**Collector example:** Same SQL, just change:
```sql
SELECT id FROM roles WHERE key = 'COLLECTOR'
```

---

## Step 4 — Test the login

```bash
curl -s -X POST http://127.0.0.1:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"mobile": "+919876543210", "password": "MySecret123"}' | jq .
```

Expected success (`backend/app/auth/router.py:132`):
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "status": "active"
}
```

Use that token to hit any protected API:

```bash
curl -s http://127.0.0.1:8000/api/me \
  -H "Authorization: Bearer eyJ..." | jq .
```

You should see your `roles`, `society_id`, and `memberships`.

Frontend login is the same — open `http://localhost:5173`, enter mobile + password.

### Common errors and fixes

| Error | Why | Fix |
|---|---|---|
| `Invalid credentials` | Phone/password wrong in Supabase, or `Auto Confirm` was off | Recreate Supabase user with correct phone + password and `Auto Confirm: ON` |
| `No local mapping` | User exists in Supabase but not in `users` table, or `auth_user_id` mismatched | Re-run Step 3 with the correct Supabase UID; check `SELECT mobile, auth_user_id FROM users WHERE mobile = '+919876543210';` |
| `No membership` / `No active membership` | `users` row exists but no `ACTIVE` row in `society_memberships` | Re-run the membership insert from Step 3 |
| `Pending approval` / `status: pending` | Membership is `PENDING` (self-signup path) | An admin must approve: `POST /api/admin/users/{user_id}/approve` (`backend/app/admin/router.py:82`) |
| `Not authenticated` | Missing or expired JWT | Log in again to get a fresh `access_token` |

---

## How roles work

- `SOCIETY_ADMIN` (`backend/app/models.py:67`) — can do everything: create flats, receipts, view reports, create/approve other users via `POST /api/admin/users` (`backend/app/admin/router.py:26`).
- `COLLECTOR` — can create receipts and view reports only.
- A user with no `ACTIVE` membership → 401. Wrong role → 403 (`backend/app/auth/deps.py:91`).

---

## After the first admin: you no longer need manual SQL

Once at least one `SOCIETY_ADMIN` is working, that admin can create everyone else from the API (no Supabase Dashboard needed):

```bash
curl -s -X POST http://127.0.0.1:8000/api/admin/users \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "mobile": "+919000000101",
    "password": "Collector123",
    "display_name": "New Collector",
    "role": "COLLECTOR"
  }' | jq .
```

This endpoint (`backend/app/admin/router.py:26`) does both steps atomically: creates the Supabase Auth user **and** the local `users` + membership + role.

### Self-signup (OTP) path — creates `PENDING` users

The app also has an OTP flow (`backend/app/auth/router.py:201`):

1. User calls `POST /auth/otp/send` with `mobile`.
2. User calls `POST /auth/otp/verify` with `mobile` + `token` (`123456` locally).
3. If no admin exists yet, the first user becomes `ACTIVE` + `SOCIETY_ADMIN`.
4. Otherwise, the new user becomes `PENDING`.
5. Admin approves via:
   - `GET /api/admin/pending` — list pending
   - `POST /api/admin/users/{user_id}/approve` with `{"role": "COLLECTOR"}`

This is the future public sign-up flow — currently it still requires admin approval.

---

## Quick checklist for a fresh database

- [ ] `uv run alembic upgrade head` — schema + roles + society ready
- [ ] Create user in **Supabase Auth** (Dashboard → Auth → Users → Add user, Auto Confirm ON) → copy UID
- [ ] Run `backend/bootstrap_production_admin.sql` **or** the manual 3-step SQL with that UID + mobile
- [ ] `curl POST /auth/login` → get `access_token` with `status: active`
- [ ] `curl GET /api/me` with that token → see `roles: ["SOCIETY_ADMIN"]`
- [ ] Future users → use `POST /api/admin/users` as admin (no more manual SQL)

---

## Files to look at if you want details

- `backend/bootstrap_production_admin.sql:1` — the first-admin script
- `backend/app/auth/router.py:132` — `POST /auth/login` logic
- `backend/app/auth/deps.py:48` — how every `Authorization: Bearer` token is verified and mapped to local user
- `backend/app/auth/supabase_client.py:104` — JWT verification (HS256 hosted / ES256 local / JWKS fallback)
- `backend/app/admin/router.py:26` — `POST /api/admin/users` (admin creates staff)
- `backend/app/models.py:75` — `users`, `society_memberships`, `membership_roles` schema
- `supabase/config.toml:268` — local test OTP numbers (`123456`)
- `backend/README.md:143` — production bootstrap docs

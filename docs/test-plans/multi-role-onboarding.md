# Test Plan — Multi-Role Onboarding (`auth/signup` canonical)

Domain seams: `CONTEXT.md` Access (`SOCIETY_ADMIN` vs `COLLECTOR`), `backend/app/auth/router.py:139` (`POST /auth/signup`), `backend/app/onboarding/router.py:31` (`GET /api/onboarding/status`), `backend/app/admin/router.py:66` (`GET /api/admin/pending`, `POST /api/admin/users/{id}/approve`).

Out of scope for this plan: OTP flow (`/auth/otp/*`), rejection flow, `MAIN_ADMIN` hierarchy.

## Seams

- **Backend HTTP** — `TestClient` via `app.main.create_app` + `SUPABASE_JWT_SECRET` mock (`backend/tests/test_multi_role_flow.py` helpers `_supabase_env`, `_setup_supabase_mocks`). DB is `manzil_os_test` via `backend/tests/conftest.py:36` (alembic auto-migrate, psycopg cleanup per test). No internal mocks; verify through public seam (`/auth/signup`, `/auth/login`, `/api/me`, `/api/onboarding/*`, `/api/admin/*`, `/api/notifications`).
- **Frontend** — Vitest + RTL + `renderWithProviders`. Route map `frontend/src/app/router.tsx:23`, guards `frontend/src/app/guards.tsx:5`, onboarding gate `frontend/src/app/layouts/app-shell.tsx:127`, pending screen `frontend/src/pages/pending.tsx` (mobile 360/390, no browser date popover — uses `NativeDateField`).

## Tracer Bullets (red→green order)

| # | Capability | Request | Expected |
|---|------------|---------|----------|
| 1 | First signup → admin | `POST /auth/signup` with no ACTIVE admin | `200 {status:"active", access_token}`; `GET /api/me` → `roles=["SOCIETY_ADMIN"]`; `GET /api/flats` 200 |
| 2 | First admin forced onboarding | `GET /api/onboarding/status` (admin, no opening_balance) | `needs_onboarding:true`; `POST /api/onboarding/setup` with `{name,location,city,opening_date,opening_amount>=0}` → 200; subsequent `needs_onboarding:false` |
| 3 | Second signup → pending + notification | `POST /auth/signup` (admin exists) | `200 {status:"pending"}`; `GET /api/admin/pending` (admin) contains entry; `GET /api/admin/pending` (pending token) 403; `GET /api/notifications` (admin) contains `message` with mobile/display_name |
| 4 | Pending login blocked | `POST /auth/login` (pending mobile) | `200 {status:"pending"}`; `GET /api/me` (pending token) `roles=[]`; `GET /api/flats` 403 "Pending approval" (`backend/app/auth/deps.py:98`) |
| 5a | Approve as COLLECTOR → receipt:create only | `POST /api/admin/users/{id}/approve {"role":"COLLECTOR"}` | 200; `GET /api/me` → `COLLECTOR`; `POST /api/receipts` 201, `POST /api/flats` 403, `GET /api/admin/*` 403; double-approve 409 |
| 5b | Approve as SOCIETY_ADMIN → full admin | `POST /api/admin/users/{id}/approve {"role":"SOCIETY_ADMIN"}` | 200; `GET /api/me` → `SOCIETY_ADMIN`; `GET /api/admin/stats` 200; new admin can `GET /api/admin/pending` and approve others |
| 6 | Onboarding gate blocks dashboard | No `cash_opening_balances` row | `GET /api/onboarding/status` true; `POST /api/onboarding/setup` restores; frontend `AppShell` (`frontend/src/app/layouts/app-shell.tsx:127`) redirects `needs_onboarding:true` → `/onboarding`, pending `memberships==0` → `/pending`, browsing `/pending` shows "Pending approval" CTA back to `/login` (`frontend/src/pages/pending.tsx:12`) |

## Negative / Edge Cases

- Duplicate mobile `POST /auth/signup` → 409 (`backend/app/auth/router.py:150`).
- Normalize mobile `9000000101` + `" +91 9000000101"` → stored `+919000000101`, login with either form succeeds (`backend/tests/test_auth.py:316`).
- Approve invalid role → 422; unknown user → 404; already ACTIVE → 409 (`backend/app/admin/router.py:85`).
- Unauthenticated `GET /api/me`, `POST /api/receipts`, `POST /api/onboarding/setup` → 401 (`backend/app/auth/deps.py:52`).
- Pending `GET /api/notifications` is blocked by `require_active` (403) — admin-only view.

## Frontend E2E (phone viewport 360/390)

- Login page (`frontend/src/pages/login.tsx:52`) shows `Sign in` / `Sign up` tabs; signup pending → `Account created — pending admin approval` + navigate `/pending`.
- Login pending → `Account pending approval…` + navigate `/pending`.
- `OnboardingPage` (`frontend/src/pages/onboarding.tsx:22`) requires `Society name` + `Opening cash >=0`; on save → `GET /api/onboarding/status` invalidated → navigate `/dashboard`.
- `PendingPage` → `Back to sign in` clears `useAuthStore` and `navigate('/login')`.

## Verification Commands

```bash
# backend (five tracers)
uv run pytest tests/test_multi_role_flow.py -v    # 5 passed (notification created in backend/app/auth/router.py:197)
uv run pytest tests/test_auth.py tests/test_onboarding.py tests/test_otp_registration.py -v

# frontend
npm test                          # login + onboarding + pending
npm run build && npm run typecheck
```

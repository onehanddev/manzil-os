# ADR 003 — Multi-Role Onboarding via `POST /auth/signup`

- Status: Accepted
- Date: 2026-09-03
- Deciders: grilled with user (Q1–Q12)
- Context: `CONTEXT.md` Access, `auth.md` self-signup, `backend/app/onboarding/router.py:31` vs `backend/app/auth/router.py:165` first-user predicate overlap.
- Decision: Canonical signup is `POST /auth/signup` (mobile+password); OTP deferred. First signup with no ACTIVE `SOCIETY_ADMIN` → `ACTIVE+SOCIETY_ADMIN` and force `GET /api/onboarding/status` gate until `POST /api/onboarding/setup`. Later signups → `PENDING` + in-app `notifications` (broadcast, `channel=IN_APP`, visible via `GET /api/notifications`) for admins; admin approves as `COLLECTOR` (default) or `SOCIETY_ADMIN` via `POST /api/admin/users/{id}/approve`. No `MAIN_ADMIN` hierarchy in Phase 0; any `SOCIETY_ADMIN` can approve. Approve-only (no reject) — duplicates 409. Pending token can `GET /api/me` (empty roles) but any `require_active` route 403 "Pending approval".
- Consequences: One new side-effect in `backend/app/auth/router.py:197` (notification on pending); new `frontend/src/pages/pending.tsx` + `/pending` route + `AppShell` redirect; `docs/test-plans/multi-role-onboarding.md` tracers cover the flow; `CONTEXT.md` patched.
- Alternatives considered: OTP as canonical (rejected per Q1), `MAIN_ADMIN` role (deferred per Q9/Q12), rejection flow (deferred per Q10).

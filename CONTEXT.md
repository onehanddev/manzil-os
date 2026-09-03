# CONTEXT.md — Manzil OS Domain Language

Ubiquitous language for the pilot. Use these terms exactly; they name good seams.

## Core

- **Society** — one pilot society (Manzil Pilot Society). All data is scoped by `society_id`.
- **Flat** — a dwelling identified by `flat_number` within a Society, belonging to a **FlatCategory**.
- **FlatCategory** — grouping for Flats (e.g. 1 BHK, 2 BHK) with `maintenance_amount`.
- **Person** — owner/tenant/contact record (name, mobile) without login; lives in a Society.
- **Occupancy** — `FlatOccupant` assignment of a Person to a Flat as `OWNER` or `TENANT`. One active per `(flat, role)`. Default payer = active TENANT if present, else active OWNER.

## Financial

- **Fund** — money bucket (Main Fund, Sinking Fund). Receipts and Expenses are tagged with a Fund.
- **Vendor** — payee for an Expense (MSEDCL, staff, store).
- **ExpenseCategory** — grouping for Expenses (Electricity, Salary, Cleaning, Lift, Repair).
- **Receipt** — cash maintenance received: `business_date`, `flat_id`, `amount>0`, `fund_id`, `payer_person_id`, `type` (REGULAR/ARREARS/PART/ADVANCE), `narration`, `collected_by` (membership), `created_at`.
- **Expense** — cash outflow: `business_date`, `amount>0`, `fund_id`, `category_id`, `vendor_id`, `narration`, `created_by`, `created_at`.
- **Cash Opening Balance** — society-level opening cash for a start date: `(society_id, opening_date, amount>=0)`.
- **Cashbook** — the deep module that owns Receipts + Expenses + Cash Opening Balances and the report equation `closing = opening + Σreceipts − Σexpenses` over a date range. **The** seam for the PRD fixture `206394 + 120200 − 82300 = 244294`.
- **Cashbook Report** — `GET /api/reports/cashbook?from&to` returns `{opening, total_receipts, total_expenses, closing, receipts[], expenses[]}` filtered by `business_date` inclusive.

## Access

- **User / SocietyMembership / Role** — `SOCIETY_ADMIN` can do everything in the pilot; `COLLECTOR` can create Receipts and view Reports; unauthenticated → 401, insufficient role → 403. Supabase JWT (`sub` → `users.auth_user_id`) is the auth seam.
- **Onboarding** — first signup with no ACTIVE `SOCIETY_ADMIN` becomes `ACTIVE+SOCIETY_ADMIN` (`backend/app/auth/router.py:165`); that admin must complete `POST /api/onboarding/setup` (`backend/app/onboarding/router.py:80`) — `GET /api/onboarding/status` `needs_onboarding` blocks all protected routes (`frontend/src/app/layouts/app-shell.tsx:127`) until society + `cash_opening_balances` exist.
- **Pending Approval** — any later `POST /auth/signup` creates `PENDING` membership (`backend/app/auth/router.py:172`) and an in-app `notifications` row for admins (`backend/app/auth/router.py:197`, `channel=IN_APP`); pending token `GET /api/me` → `roles=[]` but `GET /api/flats` 403 `Pending approval` (`backend/app/auth/deps.py:98`); admin `GET /api/admin/pending` lists, `POST /api/admin/users/{id}/approve {"role":"COLLECTOR"|"SOCIETY_ADMIN"}` activates (default `COLLECTOR`).

## Out of scope (Phase 0)

- Billing runs, charge allocation, official receipt numbers, PDFs, notifications, import preview, resident login, bank/UPI.


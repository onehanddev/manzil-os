# Manzil OS Phase 0 Issue Backlog

This backlog converts `PHASE_0_PRD.md` into small tracer-bullet issues. Each issue should be implemented, tested, reviewed, and committed independently where possible.

The PRD explains the destination. These issues explain the execution path.

## How To Use This Backlog

- Work top to bottom unless an issue explicitly says it can run in parallel.
- Keep each AI session focused on one issue.
- Before implementation, ask the agent to restate the issue and testing seam.
- Prefer a working vertical slice over broad unfinished layers.
- Do not reopen Phase 1 scope during Phase 0 implementation.
- After each issue, run the smallest meaningful tests and inspect the result.

## Issue 0: Repo Safety And Development Baseline

**Outcome**

The repo is safe to work in, secrets and dependency folders are ignored, and both frontend and backend have clear local commands.

**Scope**

- Fix `.gitignore` so `.env`, virtual environments, dependency folders, build outputs, caches, and local artifacts are not committed.
- Add or document root-level development commands if helpful.
- Confirm frontend and backend package managers.
- Do not restructure the app yet.

**Acceptance Criteria**

1. Secrets and local dependency directories are ignored.
2. `git status --short` no longer shows dependency/build/local-secret noise after ignored files are removed from tracking consideration.
3. The repo has a clear command list for backend dev, frontend dev, backend tests, frontend tests, and linting if available.
4. No application behavior changes.

**Tests And Checks**

- Run `git status --short`.
- Run available frontend and backend smoke commands.

**Non-Goals**

- No schema redesign.
- No feature implementation.

## Issue 1: Backend Schema For Phase 0 Cashbook

**Outcome**

PostgreSQL can represent the Phase 0 pilot entities and cashbook records without the broken exploratory `init.sql` shape blocking development.

**Scope**

- Create or replace the Phase 0 schema for one society, staff users, persons, flat categories, flats, flat-person assignments, funds, vendors, expense categories, opening cash balances, receipts, expenses, and audit fields.
- Preserve `society_id` internally where practical.
- Enforce positive amounts and required business dates.
- Enforce unique flat numbers per society.
- Enforce at most one active owner and one active tenant per flat if practical in Phase 0.
- Seed one society, Main Fund, Sinking Fund, common expense categories, and one admin user.

**Acceptance Criteria**

1. The schema initializes successfully from a clean database.
2. The schema supports the uploaded pilot report fixture.
3. Receipt and expense amount constraints reject zero and negative amounts.
4. Flat numbers are unique within the society.
5. Main Fund and Sinking Fund exist after seeding.
6. The schema does not expose Phase 1-only workflows as required Phase 0 dependencies.

**Tests And Checks**

- Run schema initialization against a local/test PostgreSQL database.
- Add backend tests for constraints that can be tested quickly.

**Non-Goals**

- No full billing runs.
- No receipt numbering.
- No notifications.
- No bank/UPI methods.

## Issue 2: Backend App Skeleton And Health Check

**Outcome**

The backend has a real FastAPI application that can connect to the database and expose a health endpoint.

**Scope**

- Create the FastAPI app entrypoint.
- Add database session handling.
- Add configuration loading for database URL.
- Add `GET /health` or equivalent.
- Keep AWS Lambda compatibility in mind, but do not spend Phase 0 time on full deployment automation unless already easy.

**Acceptance Criteria**

1. The backend starts locally.
2. `GET /health` returns success.
3. The app can open and close a database session.
4. Test configuration does not require production secrets.

**Tests And Checks**

- Add a backend smoke test for the health endpoint.
- Run the backend test command.

**Non-Goals**

- No API Gateway deployment.
- No production observability.

## Issue 3: Minimal Staff Auth And Roles

**Outcome**

Phase 0 users can access the pilot safely without building the full Phase 1 invitation system.

**Scope**

- Implement the simplest controlled staff access path that is compatible with later Supabase invitation flow.
- Support `SOCIETY_ADMIN` and optionally `COLLECTOR`.
- Protect all Phase 0 APIs behind an authenticated staff context.
- Ensure collector, if implemented, can create receipts but cannot manage configuration or expenses.

**Acceptance Criteria**

1. A society admin can authenticate in the pilot environment.
2. Unauthenticated API requests are rejected.
3. Admin-only endpoints reject a collector if collector is implemented.
4. Owner, tenant, and vendor records cannot log in.

**Tests And Checks**

- API tests for authenticated, unauthenticated, and unauthorized requests.

**Non-Goals**

- No WhatsApp/SMS invitations.
- No OTP registration.
- No password recovery.

## Issue 4: Master Data APIs

**Outcome**

The app can manage the minimal records needed before financial entry: flats, contacts, funds, vendors, and expense categories.

**Scope**

- Implement APIs for flat categories.
- Implement APIs for flats.
- Implement APIs for owner/tenant person records.
- Implement APIs for flat owner/tenant assignment.
- Implement APIs for funds.
- Implement APIs for vendors/payees.
- Implement APIs for expense categories.

**Acceptance Criteria**

1. Admin can create and list flat categories.
2. Admin can create and list flats.
3. Admin can create owner and tenant contacts.
4. Admin can assign owner and optional tenant to a flat.
5. Receipt defaults can identify tenant first, owner second.
6. Admin can create and list funds.
7. Admin can create and list vendors/payees.
8. Admin can create and list expense categories.

**Tests And Checks**

- API tests for each create/list flow.
- Test tenant-first and owner-fallback contact selection.

**Non-Goals**

- No bulk imports.
- No mobile UI yet unless paired with Issue 5.

## Issue 5: Receipt Entry Vertical Slice

**Outcome**

A staff user can record a cash maintenance receipt from the PWA and see it stored through the backend.

**Scope**

- Backend receipt creation endpoint.
- Backend receipt list/detail endpoint.
- Frontend receipt entry form.
- Frontend receipt list.
- Required fields: business date, flat, payer/contact, amount, fund, narration.
- Optional receipt type tag: regular, arrears, part payment, advance.

**Acceptance Criteria**

1. A user can create a cash receipt from a mobile viewport.
2. Receipt amount must be positive.
3. Receipt business date is stored and returned.
4. Receipt is linked to flat, payer/contact, fund, amount, and narration.
5. Tenant is suggested as payer when active; owner is suggested when no tenant exists.
6. The created receipt appears in the receipt list.
7. Non-cash methods are not shown.

**Tests And Checks**

- API test for receipt creation and validation.
- Frontend test or manual browser check for the mobile receipt flow.

**Non-Goals**

- No charge allocation.
- No official receipt number.
- No PDF or WhatsApp/SMS delivery.
- No 15-minute Undo.

## Issue 6: Expense Entry Vertical Slice

**Outcome**

A society admin can record a cash expense from the PWA and see it stored through the backend.

**Scope**

- Backend expense creation endpoint.
- Backend expense list/detail endpoint.
- Frontend expense entry form.
- Frontend expense list.
- Required fields: business date, expense category, vendor/payee, amount, fund, narration.
- Inline vendor/payee creation if not already present.

**Acceptance Criteria**

1. A society admin can create a cash expense from a mobile viewport.
2. Expense amount must be positive.
3. Expense business date is stored and returned.
4. Expense is linked to category, vendor/payee, fund, amount, and narration.
5. The created expense appears in the expense list.
6. Each actual cash outflow can be entered separately.
7. Non-cash methods are not shown.

**Tests And Checks**

- API test for expense creation and validation.
- Frontend test or manual browser check for the mobile expense flow.

**Non-Goals**

- No expense approval.
- No recurring expense templates.
- No attachment threshold.

## Issue 7: Opening Balance And Cashbook Report

**Outcome**

The system generates the pilot cashbook report from stored records.

**Scope**

- Backend endpoint to create/read opening cash balance for a start date.
- Backend report endpoint accepting start date and end date.
- Report calculates opening cash, receipt total, expense total, and closing cash.
- Frontend report screen matching the uploaded statement's useful structure.
- Printable report styling or CSV export if simple.

**Acceptance Criteria**

1. Admin can enter opening cash balance.
2. Report can be generated for `01-07-2026` to `31-07-2026`.
3. Report shows opening cash `206,394` for the pilot fixture.
4. Report shows receipt total `120,200` for the pilot fixture.
5. Report shows expense total `82,300` for the pilot fixture.
6. Report shows closing cash `244,294` for the pilot fixture.
7. Report rows come from receipt and expense source records.
8. Report uses business dates, not creation timestamps.

**Tests And Checks**

- Backend integration test proving `206,394 + 120,200 - 82,300 = 244,294`.
- Backend test proving date filtering uses business date.
- Frontend/manual mobile check for report display.

**Non-Goals**

- No formal balance sheet.
- No double-entry reports.
- No PDF-perfect clone.

## Issue 8: Pilot Fixture And Demo Polish

**Outcome**

The app can be demoed with realistic pilot data and a clean mobile flow.

**Scope**

- Add seed or script for the uploaded July statement fixture.
- Add representative flats, owner/tenant contacts, funds, vendors, receipt rows, expense rows, and opening balance.
- Polish mobile navigation for receipt, expense, and report flows.
- Add clear empty/loading/error states for demo paths.

**Acceptance Criteria**

1. The app can load a repeatable demo dataset.
2. The demo report matches the expected totals.
3. Receipt entry works on a phone viewport.
4. Expense entry works on a phone viewport.
5. Report viewing works on a phone viewport.
6. The demo can be completed without editing the database manually.

**Tests And Checks**

- Run backend report fixture test.
- Run frontend build/test command available in the repo.
- Manual mobile viewport pass.

**Non-Goals**

- No broad design-system pass.
- No advanced dashboard analytics.

## Recommended Execution Order

1. Issue 0: Repo Safety And Development Baseline
2. Issue 1: Backend Schema For Phase 0 Cashbook
3. Issue 2: Backend App Skeleton And Health Check
4. Issue 3: Minimal Staff Auth And Roles
5. Issue 4: Master Data APIs
6. Issue 5: Receipt Entry Vertical Slice
7. Issue 6: Expense Entry Vertical Slice
8. Issue 7: Opening Balance And Cashbook Report
9. Issue 8: Pilot Fixture And Demo Polish

## Parallelization Guidance

- Do not parallelize Issues 0 to 3. They define the foundation.
- Issue 5 and Issue 6 can run in parallel after Issue 4 if two agents work on separate frontend/backend files carefully.
- Issue 8 can start in parallel with Issue 7 once the fixture shape is clear.
- Avoid parallel edits to the schema until Issue 1 is complete.

## Definition Of Done For Every Issue

1. The issue's acceptance criteria pass.
2. Relevant tests or checks were run and results recorded.
3. The implementation did not add Phase 1-only scope.
4. The changed behavior can be explained in one short demo path.
5. Any deferred work is added to a later issue, not silently left ambiguous.

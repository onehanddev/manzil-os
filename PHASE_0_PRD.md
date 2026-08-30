# Manzil OS Phase 0 Product Requirements Document

**Status:** Deadline-safe pilot specification

**Target date:** End of current month

**Product:** Society cashbook and maintenance pilot

**Primary client:** Mobile-first web app/PWA

Phase 0 is the smallest useful product that can be shown to the pilot society without pretending the full ERP is complete. It is intentionally narrower than `PHASE_1_PRD.md`. Phase 0 should prove that the society can stop manually preparing its monthly cash statement for the core workflow: opening cash, maintenance received, expenses paid, and closing cash.

## Problem Statement

The pilot society needs a simple application to record maintenance collections and expenses and generate the same kind of monthly statement they currently maintain manually. The founder also needs a realistic backend-learning project that can be shipped quickly without hiding the important concepts behind AI-generated complexity.

The full Phase 1 ERP scope is too large for the current deadline. Trying to ship all of it in four days would create accounting risk, shallow learning, and an unreliable demo. Phase 0 must instead focus on the real customer pain visible in the uploaded statement:

- Opening cash balance
- Maintenance receipts
- Expense payments
- Receipt and expense narration
- Main and sinking fund tagging
- Closing cash balance
- Report for a selected date range

The pilot must be useful even if advanced roles, approvals, imports, notifications, receipt PDFs, resident login, and task management are deferred.

## Solution

Build a mobile-first PWA pilot with a real backend and PostgreSQL database. Use AI to move quickly, but keep the backend small enough that the founder can understand every table, endpoint, transaction, and report query.

Phase 0 will support one society, cash-only operation, basic staff login, flat/contact records, fund configuration, receipt entry, expense entry, opening-balance entry, and a cashbook report matching the uploaded statement's totals.

The core acceptance fixture is:

```text
Opening cash: 206,394
Maintenance received: 120,200
Expenses paid: 82,300
Expected closing cash: 244,294
```

The required equation is:

```text
opening cash + cash receipts - cash expenses = closing cash
```

Phase 0 is successful when the pilot society can enter enough July-style data to generate this report accurately without using another bookkeeping tool for that report.

## User Stories

1. As a society administrator, I want to log in, so that only authorized staff can access the pilot.
2. As a society administrator, I want one society preconfigured, so that I do not need to manage multi-society setup yet.
3. As a society administrator, I want to configure the society name and basic details, so that reports identify the correct society.
4. As a society administrator, I want to create funds such as Main Fund and Sinking Fund, so that receipts and expenses can be tagged correctly.
5. As a society administrator, I want to create flat categories, so that flats can be grouped for future billing configuration.
6. As a society administrator, I want to create flats, so that receipts and dues can be associated with flat numbers.
7. As a society administrator, I want to create owner and tenant contact records without login accounts, so that receipts can identify who paid or should be contacted.
8. As a society administrator, I want each flat to have an owner and optional tenant, so that the active tenant can be treated as the default payer when present.
9. As a society administrator, I want to enter an opening cash balance for a selected start date, so that the report can begin from the society's real current state.
10. As a society administrator, I want to record a cash maintenance receipt for a flat, so that collected maintenance increases recorded cash.
11. As a collector, I want to record a cash maintenance receipt for a flat, so that collection can happen from a phone.
12. As a receipt recorder, I want to enter date, flat, payer/contact, amount, fund, and narration, so that the source record explains the report line.
13. As a receipt recorder, I want to mark whether a receipt is regular maintenance, arrears, part payment, or advance, so that the report narration is meaningful.
14. As a receipt recorder, I want to record advance maintenance in Phase 0 as a tagged receipt narration, so that real pilot cases like August-to-December advance are not lost.
15. As a society administrator, I want to record a cash expense, so that paid expenses reduce recorded cash.
16. As an expense recorder, I want to enter date, category, vendor/payee, fund, amount, and narration, so that expenses can match the uploaded statement.
17. As a society administrator, I want to create vendors/payees during expense entry, so that names like staff members, stores, and service providers are preserved.
18. As a society administrator, I want to create expense categories, so that reports can group electricity, salary, cleaning, lift, repair, and similar expenses.
19. As a society administrator, I want every actual cash outflow to be a separate expense record, so that salary installments and partial payments remain accurate.
20. As a society administrator, I want the report to show income/receipt rows and expense/payment rows for a selected date range, so that it resembles the pilot document.
21. As a society administrator, I want the report to show opening balance, total receipts, total expenses, and closing balance, so that the cash summary is immediately verifiable.
22. As a society administrator, I want report totals to be drillable to receipt and expense records, so that every number can be explained.
23. As a society administrator, I want to edit draft-like mistakes before final demo data is considered locked, so that pilot setup remains practical.
24. As a society administrator, I want production financial records to be corrected through void/reversal later, so that Phase 1 can add stricter audit behavior without data loss.
25. As the founder, I want the backend to use real database constraints and transactions, so that I learn the backend concepts that matter.
26. As the founder, I want a small API surface, so that I can understand and debug every endpoint.
27. As the founder, I want seed/demo data matching the uploaded statement, so that the pilot can be tested repeatedly.
28. As the founder, I want basic automated tests around the report equation, so that changes do not break the most important customer promise.

## Implementation Decisions

### Scope

- Phase 0 is a pilot cashbook, not the full ERP.
- One society is supported in the UI.
- Data should still include `society_id` internally where practical, so Phase 1 does not require a full rewrite.
- Cash is the only payment method.
- The UI should be mobile-first and usable as a PWA.
- The uploaded statement is the target report shape for Phase 0.

### Roles And Access

- Phase 0 may use a simplified staff model.
- Required roles are `SOCIETY_ADMIN` and optionally `COLLECTOR` if time permits.
- `SOCIETY_ADMIN` can manage configuration, flats, contacts, funds, receipts, expenses, and reports.
- `COLLECTOR` can record receipts and view only the flat/contact fields needed for collection.
- `COMMITTEE_MEMBER`, `SECURITY_GUARD`, resident, owner, tenant, and vendor login are deferred.
- If full invitation and OTP-password lifecycle is too large for the deadline, a controlled admin-created staff account flow is acceptable for Phase 0, as long as the data model does not block the Phase 1 invitation model.

### Core Data Model

- `societies`: one pilot society.
- `staff_users` or equivalent authenticated staff records.
- `roles` and role assignments if quick to preserve from Phase 1; otherwise a minimal admin flag is acceptable only for Phase 0.
- `persons`: owner, tenant, staff, and payee/contact records where appropriate.
- `flat_categories`: customizable labels such as 1 BHK, 2 BHK, small, medium, and large.
- `flats`: flat number, category, active status.
- `flat_person_assignments`: owner and optional tenant relationship for a flat.
- `funds`: at minimum Main Fund and Sinking Fund.
- `expense_categories`: society-defined categories.
- `vendors`: non-login vendor/payee records.
- `cash_opening_balances`: start date and opening recorded cash.
- `receipts`: cash maintenance receipts linked to flat, payer/contact, fund, date, amount, and narration.
- `expenses`: cash expenses linked to category, vendor/payee, fund, date, amount, and narration.
- `audit_fields`: created by, created at, updated by, updated at on important records.

### Financial Behavior

- Opening cash is entered once for the selected pilot start date.
- Receipts increase recorded cash.
- Expenses decrease recorded cash.
- Phase 0 does not need full due allocation, automated charge generation, official receipt numbering, receipt PDF delivery, WhatsApp/SMS delivery, or 15-minute Undo.
- Advance, arrears, part-payment, and period coverage can be captured as receipt type and narration in Phase 0.
- Main Fund and Sinking Fund balances can be calculated from opening fund balances if implemented, plus tagged receipts and expenses. If time is short, fund tagging is required and fund balance reporting is secondary to the cashbook report.
- Every report total must come from stored receipt and expense records, not from manually entered report totals.
- Report dates use the transaction business date, not record creation time.

### Report Requirements

- The report accepts a start date and end date.
- The report displays society name and selected date range.
- The report displays receipt rows with date, particulars/narration, receipt amount, flat where available, and fund where useful.
- The report displays expense rows with date, particulars/narration, payment amount, category, vendor/payee where available, and fund where useful.
- The report displays total receipts and total expenses.
- The report displays cash summary: opening balance, period receipts, period expenses, and closing balance.
- The report must reproduce the uploaded sample totals: `206,394 + 120,200 - 82,300 = 244,294`.
- PDF export is optional for Phase 0. Printable browser view or CSV export is acceptable if PDF takes too long.

### Technical Direction

- Use FastAPI for the backend.
- Use PostgreSQL as the source of truth.
- Keep AWS API Gateway plus Lambda as the intended deployment target, but local development can run FastAPI normally.
- Supabase remains the intended authentication provider. Phase 0 can use a simpler controlled auth path if integrating the full Supabase invitation flow threatens the deadline.
- Use database transactions for receipt creation, expense creation, and report fixture setup.
- Keep SQL constraints simple but real: positive amounts, required dates, required society ownership, unique flat numbers per society, and valid role/type values.
- Avoid building a generic accounting engine in Phase 0.
- Avoid abstract frameworks, excessive services, and premature event systems.

## Implementation Task List

### Backend Tasks

1. Create or revise the database schema for Phase 0 tables.
2. Add seed data for one society, Main Fund, Sinking Fund, common expense categories, and one admin user.
3. Implement database connection/session handling.
4. Implement authentication guard or controlled Phase 0 staff session.
5. Implement role/permission check for society admin and collector if collector is included.
6. Implement CRUD endpoints for flat categories.
7. Implement CRUD endpoints for flats.
8. Implement CRUD endpoints for owner/tenant person records.
9. Implement flat owner/tenant assignment endpoints.
10. Implement CRUD endpoints for funds.
11. Implement CRUD endpoints for expense categories.
12. Implement inline vendor/payee creation endpoint or expense-side creation behavior.
13. Implement opening cash balance endpoint.
14. Implement receipt creation endpoint.
15. Implement receipt list/detail endpoints.
16. Implement expense creation endpoint.
17. Implement expense list/detail endpoints.
18. Implement cashbook report endpoint.
19. Implement pilot fixture data matching the uploaded July report.
20. Add integration tests for the cashbook equation.

### Frontend Tasks

1. Keep or simplify login so the pilot can be accessed reliably.
2. Build a mobile-first app shell with dashboard navigation.
3. Build society configuration screen if not seeded-only.
4. Build flat category management screen.
5. Build flat management screen.
6. Build owner/tenant contact entry screen.
7. Build fund management screen.
8. Build expense category management screen.
9. Build receipt entry screen optimized for phone use.
10. Build receipt list screen.
11. Build expense entry screen optimized for phone use.
12. Build expense list screen.
13. Build cash opening balance screen.
14. Build monthly report screen matching the uploaded statement's structure.
15. Add print-friendly report styling.
16. Add basic loading, empty, error, and success states.
17. Add mobile viewport checks for receipt, expense, and report flows.

### Data Entry Tasks For Demo

1. Enter opening cash balance: `206,394`.
2. Enter July receipt rows totaling `120,200`.
3. Enter July expense rows totaling `82,300`.
4. Verify closing cash equals `244,294`.
5. Enter representative flat records, including a tenant-default-payer case and an owner-fallback case.
6. Enter Main Fund and Sinking Fund examples.
7. Enter vendors/payees appearing in the uploaded statement where useful.

## Acceptance Criteria

1. A user can access the Phase 0 app on a mobile-sized screen.
2. The app has one pilot society available without requiring society switching.
3. A society admin can create and view flat categories.
4. A society admin can create and view flats.
5. A society admin can create owner and tenant contact records.
6. A flat can show its owner and optional tenant.
7. If a flat has a tenant, receipt entry defaults the tenant as payer/contact.
8. If a flat has no tenant, receipt entry defaults the owner as payer/contact.
9. A society admin can create and view Main Fund and Sinking Fund.
10. A society admin can create and view expense categories.
11. A society admin can create or select a vendor/payee while entering an expense.
12. A society admin can enter an opening cash balance for a selected date.
13. A society admin or collector can create a cash receipt with date, flat, payer/contact, amount, fund, and narration.
14. A receipt amount must be positive.
15. A receipt must increase the report's receipt total for its business date.
16. A society admin can create a cash expense with date, category, vendor/payee, amount, fund, and narration.
17. An expense amount must be positive.
18. An expense must increase the report's expense total for its business date.
19. The report can be generated for `01-07-2026` to `31-07-2026`.
20. With the pilot fixture, the report shows opening cash `206,394`.
21. With the pilot fixture, the report shows total receipts `120,200`.
22. With the pilot fixture, the report shows total expenses `82,300`.
23. With the pilot fixture, the report shows closing cash `244,294`.
24. The report equation is calculated by the system, not typed manually into the report.
25. Receipt and expense rows can be traced back from the report to their source records.
26. Cash-only behavior is enforced in the UI.
27. Non-cash methods are not shown in the Phase 0 UI.
28. The app prevents missing required fields for receipts and expenses.
29. The app records who created each receipt and expense.
30. The app records when each receipt and expense was created.
31. The core receipt, expense, and report flows work on a phone viewport.
32. The backend has an automated test proving `206,394 + 120,200 - 82,300 = 244,294`.
33. The backend has automated tests for positive receipt and expense amounts.
34. The backend has automated tests that report totals use business dates.
35. The app can be demoed without relying on Excel, Tally, or another bookkeeping system for the July cash statement.

## Testing Decisions

- The highest-value Phase 0 test is the report equation using real database records.
- Test the backend report endpoint against PostgreSQL or the closest available integration database setup.
- Test receipt creation, expense creation, and report generation through public API behavior, not private helper functions.
- Use the uploaded statement as a fixture, not as hard-coded output.
- Frontend tests should cover the main mobile flows: receipt entry, expense entry, and report display.
- Do not spend Phase 0 time testing deferred workflows such as notifications, approvals, resident login, official receipt PDFs, import previews, or recurring billing runs.

## Out of Scope

- Full Phase 1 billing runs and published charges.
- Automated maintenance generation.
- Full receipt allocation against charges.
- Official receipt numbers.
- Receipt PDF generation and delivery.
- WhatsApp, SMS, and PWA push notifications.
- 15-minute receipt Undo window.
- Admin-only post-finalization void workflow.
- Expense approval workflow.
- Recurring expense templates.
- Spreadsheet import preview and atomic import application.
- Resident, owner, tenant, vendor, committee member, and security guard login.
- Task management, resident complaints, and service requests.
- Bank, UPI, cheque, and reconciliation workflows.
- Formal balance sheet, double-entry accounting, chart of accounts, trial balance, GST, TDS, payroll, and statutory reports.
- Multi-society switching and society self-service onboarding.
- Native mobile applications.

## Further Notes

- Phase 0 should not paint itself into a corner. Use names and data shapes that can evolve into the Phase 1 PRD.
- The founder should personally understand the schema, the receipt endpoint, the expense endpoint, and the report query before demoing.
- AI should be used for scaffolding, review, test generation, and debugging, but not as a substitute for understanding the financial logic.
- If time runs short, prioritize the report equation, receipt entry, expense entry, and mobile usability over configuration polish.
- The honest customer promise is: Phase 0 replaces the manual monthly cash statement. Phase 1 becomes the controlled ERP.

# Manzil OS Phase 1 Product Requirements Document

**Status:** Agreed Phase 1 specification

**Product:** Society ERP and cashbook

**Primary client:** Mobile-first installable PWA

**Pilot context:** Indian residential society

This document is the source of truth for Phase 1. Existing planning notes, frontend placeholders, and the initial SQL schema are exploratory inputs. Where they conflict with this document, this document governs.

## Problem Statement

The pilot society currently depends on manually prepared records to track maintenance collections, expenses, fund balances, and monthly cash movement. Those records are difficult to validate, reconcile, search, correct safely, or attribute to the person who entered them. They also do not provide a controlled workflow for inviting staff, collecting flat-level maintenance, issuing receipts, approving expenses, importing opening data, and carrying balances between periods.

The society needs a mobile-first application that can replace its operational spreadsheets and standalone bookkeeping for the Phase 1 workflow. It must reproduce the information in the pilot's receipts-and-payments statement: opening cash, maintenance received, expenses paid, and closing cash for a selected period. It must additionally preserve the flat, payer, charge period, fund, vendor, recorder, approver, narration, and audit history behind every reported amount.

Phase 1 is not intended to clone Tally or provide statutory accounting. It is an operational society cashbook with maintenance dues and fund subledgers. It serves one configured society at launch while preserving tenant-safe boundaries that allow multi-society operation to be introduced later.

## Solution

Build a mobile-first web application and installable PWA for society staff. Staff are invited against pre-authorized mobile numbers, verify registration through OTP, set a password, and subsequently sign in with mobile number and password. Society administrators assign one or more fixed roles to each staff member.

The application will manage society configuration, people, flats, owner and tenant assignments, maintenance schedules and rates, draft billing runs, published charges, cash receipts, receipt allocation, flat advances, cash expenses, vendors, recurring expense templates, main and sinking funds, imports, notifications, audit history, and reports.

Collectors record cash receipts against flats. A recorded receipt affects dues, advances, cash, and funds immediately, but remains in a fixed 15-minute finalization window. During that window, the collector may use Undo, which creates the required reversals and cancels receipt delivery. When the window expires, the system assigns/finalizes the official receipt, generates its PDF, and sends it to the flat's default contact through WhatsApp with SMS-link fallback. After finalization, only a society administrator may void and replace it.

Committee members may submit expenses. Expenses do not affect cash or funds until a society administrator approves them. Recurring expense configuration creates drafts or reminders, never automatic cash deductions.

All staff notifications remain available in an in-app notification center with an unread badge and are also attempted as PWA push notifications. Messaging and push failures never roll back financial transactions.

The pilot will use INR, Asia/Kolkata, cash-only transactions, a configurable billing-cycle start month, and one seeded cash-on-hand account. The data model will allow future money-account types, but bank, UPI, and cheque workflows are not exposed in Phase 1.

Phase 1 is accepted when the pilot society can start at an arbitrary cutover date, import its required opening/current-year records, run recurring maintenance billing, record and allocate collections including arrears, part payments, and advances, approve expenses, reconcile recorded cash, track main and sinking funds, and generate the agreed period report without relying on another operational bookkeeping application.

## User Stories

1. As a platform administrator, I want to provision the pilot society, so that its staff can begin configuration without exposing society creation to ordinary users.
2. As a platform administrator, I want platform privileges to be separate from society roles, so that operating the software does not grant accidental society membership.
3. As a society administrator, I want to invite staff by mobile number, so that only pre-authorized people can register.
4. As a society administrator, I want to resend an invitation, so that a staff member can recover from a missed or expired message.
5. As a society administrator, I want to revoke an unused invitation, so that a person who should no longer have access cannot register.
6. As an invited staff member, I want an invitation link to open the PWA registration screen, so that onboarding works naturally on a phone.
7. As an invited staff member, I want to verify my mobile number by OTP, so that the system confirms I control the invited number.
8. As an invited staff member, I want to set a password after OTP verification, so that later sign-ins do not require an OTP.
9. As a registered staff member, I want to sign in with mobile number and password, so that routine access is fast.
10. As a registered staff member, I want a secure OTP-based password-recovery flow, so that I can regain access without administrator access to my password.
11. As a society administrator, I want to assign several roles to one person, so that a committee member may also collect maintenance.
12. As a society administrator, I want to add or remove roles, so that permissions follow current responsibilities.
13. As a staff member, I want my effective permissions to be the union of my assigned roles, so that the application behaves consistently.
14. As a society administrator, I want role changes to be audited, so that access changes are attributable.
15. As a staff member, I want unauthorized screens and actions to be unavailable, so that I cannot accidentally perform restricted work.
16. As a society administrator, I want to configure society identity, address, billing-cycle start month, receipt settings, daily-summary time, and expense-evidence threshold, so that the application reflects society policy.
17. As a society administrator, I want to create customizable flat categories such as 1 BHK, 2 BHK, small, medium, and large, so that maintenance rates fit the society.
18. As a society administrator, I want to create and deactivate flats, so that billing covers the active property inventory while preserving history.
19. As a society administrator, I want each flat to have at most one active owner and one active tenant, so that responsibility is unambiguous.
20. As a society administrator, I want historical owner and tenant assignments to be retained with effective dates, so that occupancy changes do not rewrite records.
21. As a society administrator, I want owners and tenants represented without login accounts, so that Phase 1 can bill and contact them without a resident portal.
22. As a future product operator, I want a person record to support later linking to a verified account, so that Phase 2 does not duplicate people or discard history.
23. As a society administrator, I want owner and tenant mobile numbers stored in normalized form, so that matching and delivery are reliable.
24. As a society administrator, I want the active tenant to be the default payer/contact and the active owner to be the fallback, so that receipts reach the person living in the flat when applicable.
25. As a society administrator, I want charges and dues to belong to the flat rather than the current person, so that ownership or tenancy changes do not erase the flat ledger.
26. As a society administrator, I want to configure main and sinking funds, so that maintenance and expenses are earmarked correctly.
27. As a society administrator, I want to create, rename, activate, and deactivate additional funds, so that the fund structure is not hard-coded to the pilot.
28. As a society administrator, I want to configure charge types and their default funds, so that published charges credit the intended fund.
29. As a society administrator, I want monthly, quarterly, half-yearly, yearly, and one-time charge frequencies, so that the society's maintenance schedules are represented.
30. As a society administrator, I want effective-dated fixed rates by flat category, so that rate changes preserve historical billing.
31. As a society administrator, I want due-date rules and cycle start month to be configurable, so that the pilot's calendar-year cycle and another society's cycle can differ.
32. As a society administrator, I want recurring schedules to generate draft billing runs, so that charges can be reviewed before flats owe money.
33. As a society administrator, I want a draft billing run to show flat counts and totals grouped by charge type and fund, so that configuration mistakes are visible.
34. As a society administrator, I want billing-run generation to be idempotent, so that retries or concurrent actions cannot duplicate charges.
35. As a society administrator, I want to publish a reviewed billing run, so that charges become collectible in one controlled action.
36. As a society administrator, I want published charges to remain immutable, so that historical dues remain reproducible.
37. As a society administrator, I want an incorrect published charge voided and reissued rather than edited, so that corrections are auditable.
38. As a collector, I want to search a flat and see its unpaid charges and advance balance, so that I can record the intended payment accurately.
39. As a collector, I want the system to propose oldest-due-first allocation, so that arrears are settled consistently.
40. As an authorized receipt recorder, I want to override the proposed allocation before submission, so that a payer's explicit period instruction can be honored.
41. As a collector, I want to record a part payment, so that incomplete maintenance receipts reduce the correct outstanding charge.
42. As a collector, I want to record payment covering several periods, so that arrears and current dues can be settled together.
43. As a collector, I want excess or future-period money retained as flat-level advance credit, so that advance maintenance such as August-to-December payment is represented.
44. As a society administrator, I want future charges to consume advance only through explicit allocation records, so that every balance movement is traceable.
45. As a collector, I want receipt submission to update recorded cash, dues, advances, and funds atomically, so that partial failures cannot corrupt balances.
46. As a collector, I want an immediate confirmation after submission, so that I know the cash collection was recorded.
47. As a collector, I want a 15-minute Undo action after submission, so that I can correct an obvious wrong-flat or wrong-amount entry before receipt delivery.
48. As a collector, I want Undo to reverse every financial effect and cancel queued delivery, so that no hidden balance remains.
49. As a payer, I want the finalized receipt sent after the correction window, so that I receive an official record of payment.
50. As a payer, I want a WhatsApp receipt with SMS-link fallback, so that delivery can succeed through an available channel.
51. As a payer without an account, I want a receipt link that grants access only to that receipt, so that I can view the PDF without receiving broader society access.
52. As a society administrator, I want only administrators to void finalized receipts, so that post-delivery corrections are controlled.
53. As a society administrator, I want voiding to require a reason, reverse dues/advance/fund/cash effects, and notify the payer, so that the ledger and external record agree.
54. As a collector, I want to create a replacement after a void, so that the corrected receipt stands independently.
55. As a society administrator, I want official receipt numbers scoped to society and calendar year, so that receipts are identifiable and sortable.
56. As a society administrator, I want a collector-wise daily collection statement, so that cash responsibility is visible.
57. As a society administrator, I want to acknowledge daily collector handover, so that the application records operational accountability without modeling cash transfers.
58. As a society administrator, I want acknowledgment not to alter receipt or cash totals, so that handover tracking cannot duplicate money.
59. As a society administrator, I want to create vendors while entering an expense, so that record keeping does not interrupt the workflow.
60. As a society administrator, I want vendors to remain non-login records, so that suppliers cannot access the application.
61. As an expense recorder, I want configurable expense categories, so that reporting matches society terminology.
62. As a committee member, I want to submit an expense with vendor, category, fund, amount, date, narration, and evidence, so that an administrator can review it.
63. As a committee member, I want a submitted expense to remain pending without reducing cash or funds, so that unapproved entries do not affect books.
64. As a society administrator, I want to approve or reject a pending expense, so that only reviewed expenses affect financial balances.
65. As a society administrator, I want rejection to require a reason and change no financial balance, so that the submitter understands the decision.
66. As a society administrator, I want an expense I enter myself to post immediately, so that routine administration remains efficient.
67. As a society administrator, I want an approved expense to debit cash and its selected fund atomically, so that reports and subledgers stay aligned.
68. As a society administrator, I want approved expenses corrected through reversal rather than editing, so that financial history remains trustworthy.
69. As an expense recorder, I want every actual cash outflow stored separately, so that installment payments such as staff salary remain accurate.
70. As an expense recorder, I want related installments to share an optional reference, so that a monthly salary or bill can be viewed together.
71. As a society administrator, I want an evidence threshold, so that larger expenses require an attachment while small cash expenses remain practical.
72. As a society administrator, I want recurring expense templates, so that expected salaries and routine costs are not forgotten.
73. As a society administrator, I want recurring templates to generate drafts or reminders rather than cash deductions, so that variable amounts and actual payment dates remain accurate.
74. As a staff member, I want actionable records in an in-app queue, so that missed push notifications do not hide work.
75. As a staff member, I want an unread notification badge, so that pending work is visible when I open the PWA.
76. As a staff member, I want PWA push notifications for relevant events, so that I can respond without keeping the app open.
77. As a society administrator, I want a configurable end-of-day summary of receipts, collector totals, expenses, reversals, and pending work, so that daily activity can be reviewed.
78. As a society administrator, I want notification delivery status recorded, so that failed WhatsApp, SMS, or push attempts can be diagnosed or retried.
79. As a financial operator, I want a failed notification never to roll back a valid transaction, so that messaging availability cannot corrupt books.
80. As a payer, I want receipt identity and payer/contact details snapshotted, so that later mobile or occupancy changes do not rewrite issued records.
81. As a society administrator, I want to import people, flats, assignments, and vendors, so that setup does not require manual re-entry.
82. As a society administrator, I want to import current-year receipts and expenses when reliable history exists, so that the pilot can preserve its current calendar year.
83. As a society administrator, I want to import opening cash, flat dues, flat advances, and fund balances independently, so that cutover can begin on any chosen date.
84. As a society administrator, I want optional older transaction-history imports, so that available historical records can enrich the ledger without blocking launch.
85. As a society administrator, I want an import preview with valid rows, errors, duplicates, and balance effects, so that mistakes are corrected before posting.
86. As a society administrator, I want confirmed imports applied atomically, so that a partially failed spreadsheet does not leave inconsistent data.
87. As an auditor, I want the original import file and row-level results retained, so that migrated records can be traced to their source.
88. As a society administrator, I want a receipts-and-payments report for any date range, so that monthly and custom-period activity can be reviewed.
89. As a society administrator, I want the report to show opening cash, receipt lines, expense lines, totals, and closing cash, so that it reproduces the pilot document's essential information.
90. As a society administrator, I want receipt lines to aggregate by report criteria without losing source receipt detail, so that summaries remain auditable.
91. As a society administrator, I want report drill-down from an aggregate to source records, so that totals can be explained.
92. As a society administrator, I want flat ledgers showing charges, allocations, advances, voids, and outstanding dues, so that payer questions can be answered.
93. As a society administrator, I want fund ledgers and balances for the main, sinking, and configured funds, so that earmarked money is visible.
94. As a society administrator, I want collector-wise receipt and acknowledgment reports, so that recorded collection and handover responsibility can be reviewed.
95. As a society administrator, I want expense reports by date, category, vendor, recorder, approver, and fund, so that spending can be analyzed.
96. As a society administrator, I want PDF and spreadsheet exports, so that reports can be shared and archived.
97. As an auditor, I want arbitrary past-period reports to remain reproducible, so that later configuration changes do not alter historical results.
98. As an auditor, I want every sensitive or financial action attributed to an actor and timestamp, so that responsibility is clear.
99. As an auditor, I want before/after data and correction reasons retained, so that changes can be reconstructed.
100. As a society administrator, I want referenced records deactivated, end-dated, voided, or reversed instead of deleted, so that history is preserved.
101. As a user, I want the application optimized for phone screens and installable from the browser, so that it behaves like a practical mobile application.
102. As a user, I want the application shell to explain how to install the PWA, so that I can add its icon to my home screen.
103. As a user, I want financial writes to require connectivity and explicit success, so that offline retries cannot duplicate money.
104. As a future operator, I want all society-owned records scoped by society internally, so that Phase 2 can enable multiple societies safely.
105. As a Phase 1 user, I want no society switcher or multi-society setup flow, so that the pilot remains simple.

## Implementation Decisions

### Product Boundary

- Phase 1 includes society configuration, staff identity and authorization, people, flats, effective-dated owner/tenant assignments, flat categories, charge configuration, billing, cash receipts, receipt PDFs, advances, funds, expenses, vendors, recurring expense templates, imports, notifications, audit history, and reports.
- Task management, resident complaints, service requests, and security-guard workflows are entirely deferred.
- The application serves one provisioned society in Phase 1. Society creation and switching are hidden from society users.
- Society ownership remains explicit throughout the schema, API authorization, constraints, and tests so multi-society support does not require re-partitioning financial data.
- The pilot report is a cash-basis receipts-and-payments/income-and-expense cashbook report, not a formal balance sheet.

### Technology And Runtime

- The client is a responsive React PWA and web application, designed mobile-first. No native application is required.
- The backend is FastAPI deployed through AWS API Gateway and Lambda.
- Supabase provides authentication; PostgreSQL is the system of record for application and financial data.
- Financial operations run in explicit PostgreSQL transactions. External messages and PDFs are dispatched asynchronously through an outbox/queue after the financial transaction commits.
- All timestamps are stored with timezone and displayed using Asia/Kolkata. Business dates are stored separately from creation timestamps where applicable.
- Monetary values use exact decimal storage in INR. Floating-point arithmetic is prohibited for money.

### Identity And Authorization

- A business `person` record exists independently of authentication and has an internal immutable UUID.
- A person may have an optional Supabase authentication identity. Future owner/tenant login links to the existing person instead of creating a replacement record.
- Mobile numbers are mandatory and globally unique in Phase 1, normalized as E.164 text. Mobile-number change is out of scope.
- Administrators pre-create/invite staff. Registration verifies the invited mobile by OTP, links the existing person to the Supabase identity, and allows password creation.
- Routine login uses mobile number and password. Password recovery uses OTP verification.
- Invitations have explicit states, expiration, resend, and revocation. An invitation link alone never authenticates a user.
- Invitation states are `PENDING`, `OTP_VERIFIED`, `ACCEPTED`, `EXPIRED`, and `REVOKED`. Invitations are single-use; resending invalidates the previous invitation token without changing the pre-authorized mobile number.
- Society roles are `SOCIETY_ADMIN`, `COMMITTEE_MEMBER`, and `COLLECTOR`. `PLATFORM_ADMIN` is separate from society membership.
- One membership may hold several roles. Effective permissions are the union of assigned roles.
- `SOCIETY_ADMIN` manages configuration, people, roles, billing, receipts, imports, expenses, reports, reversals, and voids.
- `COMMITTEE_MEMBER` can view authorized dashboards/reports, record receipts, and submit expenses, but cannot assign roles, publish billing, approve expenses, or void financial records.
- `COLLECTOR` can view the minimum flat/dues information required for collection and record receipts. It cannot configure billing, submit expenses, approve expenses, or void finalized receipts.
- Backend authorization is authoritative. Frontend route visibility is only a user-experience aid.
- Every society-owned query and mutation is scoped to the authenticated membership's society. Tenant isolation is enforced at API, repository, database-constraint, and PostgreSQL-policy layers.

### People And Flats

- Owners, tenants, vendors, and other contacts are business records, not Phase 1 login roles.
- A flat belongs to a configurable flat category and has an active/inactive lifecycle without destructive deletion.
- Effective-dated assignments relate people to flats as `OWNER` or `TENANT`.
- Database rules prohibit overlapping effective-date ranges for the same flat and relationship type, permitting at most one owner and one tenant for any date while preserving ended and future assignments.
- The active tenant is the default receipt recipient and payer contact. If no tenant is active, the active owner is the default.
- Charges and outstanding balances belong to flats. Payer and recipient details are recorded separately and snapshotted on finalized receipts.
- The default recipient is resolved and snapshotted when a receipt is submitted, so an assignment change during the finalization window cannot redirect that receipt.

### Configuration, Billing, And Funds

- Admin-configurable charge frequencies are monthly, quarterly, half-yearly, yearly, and one-time.
- Maintenance rates are fixed amounts, effective-dated, and selected by flat category and charge type.
- Charge types define a default fund, due-date rule, recurrence, and billing-cycle behavior.
- Square-foot formulas, percentages, discounts, interest, tax, and late-fee engines are not included.
- The pilot seeds a Main Fund and Sinking Fund. Administrators may create and deactivate additional funds.
- Publishing a charge assigns it to one fund but creates no fund balance movement. Receipt allocation credits the charge's assigned fund. A single payment may credit several funds by allocating to charges associated with different funds.
- An expense debits one selected fund. Splitting one expense among funds is deferred.
- Recurring schedules create idempotent draft billing runs. Drafts display counts and totals by charge type and fund.
- Each recurring schedule has a local-date anchor, frequency, and due-date rule. Monthly, quarterly, half-yearly, and yearly periods advance by 1, 3, 6, and 12 calendar months from the anchor; one-time charges have explicit period and due dates. A configured day beyond a month's length clamps to that month's final day.
- Publication is an explicit society-admin action. Published charges are immutable and collectible.
- Published-charge correction uses void and replacement. Publication and correction history is preserved.

### Cash Receipts And Advances

- Phase 1 accepts cash only. A generic money-account model exists, but only one society `CASH_ON_HAND` account is active and selectable.
- Bank transfer, UPI, cheque, bank reconciliation, and account transfers remain disabled and out of scope.
- Each actual payment is one source receipt linked to one flat. Reports may aggregate receipts but source records remain individual.
- Payment allocation defaults to oldest due first, may be overridden before submission by an authorized recorder, and supports partial settlement and multi-period settlement.
- Allocation cannot exceed the receipt or charge balance. Cross-flat, cross-society, and cross-fund mismatches are rejected.
- Excess or explicitly future-period money becomes flat-level advance credit designated for a charge type and its fund. The advance credits that fund when received. Later application to a published charge settles dues through an explicit allocation but does not credit the fund a second time.
- Receipt submission atomically records the payment, allocations, advance movement, cash movement, and fund credits.
- A submitted receipt enters `FINALIZATION_PENDING` for exactly 15 minutes while remaining financially effective.
- During `FINALIZATION_PENDING`, only the recorder may invoke Undo. Undo transitions the receipt to `UNDONE` and records the reversal of all financial effects; it does not erase audit history.
- Receipt PDF generation and payer delivery remain queued during the 15-minute window. Undo cancels those queued actions.
- The allowed lifecycle is `FINALIZATION_PENDING -> UNDONE` or `FINALIZATION_PENDING -> FINALIZED -> VOIDED`. The Undo request wins only if committed before the finalization transaction begins; otherwise admin void is required.
- After the window, the receipt becomes `FINALIZED`, receives its official society/year sequence number, and is immutable. Official numbers are assigned only at finalization and are never assigned to `UNDONE` receipts.
- Finalized-receipt correction is restricted to society administrators and requires void reason, balanced reversal records, payer cancellation notification, and a separate replacement receipt when needed.
- Sequence gaps caused by failed generation or concurrency are acceptable. Receipt numbers are unique and never reused.
- Collector submission does not require society-admin approval.
- The system produces collector-wise daily statements. Admin handover acknowledgment is operational metadata and does not create another cash movement.

### Expenses And Vendors

- Vendors are society-scoped, non-login records with name, optional contact person, mobile, notes, and active status.
- Vendor creation is available inline during expense entry. Possible duplicates produce warnings rather than hard uniqueness failures.
- Expense categories and recurring expense templates are admin-configurable.
- Each actual cash outflow is a separate expense record, including installments toward one salary or bill. An optional common reference groups related payments.
- Committee-member expense submissions enter `PENDING_APPROVAL` and have no cash or fund effect.
- Collectors cannot submit expenses.
- Any active society administrator may approve or reject another user's pending expense.
- A society administrator's own expense entry posts immediately in Phase 1.
- Approval atomically records cash debit and fund debit. Rejection records actor, timestamp, and reason but no financial movement.
- Post-approval correction requires admin reversal. Approved expenses are never edited or deleted.
- Attachments are optional below a society-configured threshold and required at or above that threshold.
- Recurring templates generate drafts/reminders only. A user must complete actual amount, date, vendor, narration, and evidence, and an admin must approve where applicable.

### Notifications And Documents

- Every authenticated staff notification appears in the in-app notification center and unread badge. The system also attempts a PWA push notification.
- The in-app record is authoritative when push permission is denied or delivery fails.
- Staff invitations use WhatsApp first with SMS fallback and open the PWA registration route.
- Finalized payer receipts use WhatsApp first. SMS fallback contains a secure link that opens a receipt-only PWA view and PDF download.
- Because owners and tenants do not authenticate in Phase 1, receipt links use high-entropy, revocable, receipt-scoped access tokens and expose no unrelated society or flat data.
- Delivery records track channel, state, attempts, provider identifiers, timestamps, and failure reason.
- Notification failure never rolls back a committed receipt, expense, reversal, or billing event.
- Society administrators receive a configurable end-of-day summary covering receipts, collector totals, handover acknowledgment, expenses, reversals, failed deliveries, and pending actions.
- Generated receipt PDFs snapshot society, flat, payer/recipient, amount, payment date, covered charges/periods, allocations, advance amount, receipt number, recorder, and status.

### Imports And Cutover

- The pilot may cut over on the first day of any selected month or another explicitly selected date.
- Separate import templates handle people/flats/assignments/vendors, current-year receipts, current-year expenses, opening flat dues, opening flat advances, opening funds, and opening cash.
- Optional historical transactions may be imported through the same validated transaction contracts; complete history is not required for launch.
- Each import has upload, parsing, preview, validation, confirmation, application, and completed/failed states.
- Preview reports valid rows, invalid rows, suspected duplicates, and projected balance effects.
- A confirmed import is idempotent and atomic. Retrying the same import cannot duplicate records.
- Original files, checksums, row-level outcomes, importer, confirmation time, and resulting record identifiers are retained.
- Opening cash, opening dues, opening advances, and opening fund balances are distinct migration dimensions and are validated independently.
- Migration entries are visibly marked and included in audit and reporting.

### Reporting And Reconciliation

- The primary report follows the pilot statement's meaning: selected date range, opening recorded cash, receipt rows, expense rows, total receipts, total expenses, and closing recorded cash.
- The core equation is `opening cash + receipt cash movements - expense cash movements = closing cash`. Financially effective `FINALIZATION_PENDING` and `FINALIZED` receipts count when they occur; an Undo, void, or expense reversal contributes an opposite movement when the reversal occurs.
- Reports are append-only by business event date. An original receipt or expense remains in its original period, while a later reversal appears in the reversal period. A receipt still inside its finalization window is visibly marked as pending delivery.
- Reports support arbitrary date ranges and preserve actual transaction date separately from billing period and record-creation time.
- Reports aggregate source records without replacing them and support drill-down to the underlying records.
- Phase 1 reports include receipts and payments, flat ledger/outstanding dues, flat advances, fund balances and transactions, expenses by category/vendor/fund, collector daily collections and acknowledgment, imports, and notification failures.
- Reports export to PDF and spreadsheet formats.
- The pilot's billing cycle is calendar-year based, but cycle start month is society configuration rather than a hard-coded global assumption.

### Audit, Integrity, And Operations

- Financial writes use idempotency keys and database transactions.
- Concurrency controls prevent duplicate billing, duplicate receipt finalization, over-allocation, double fund posting, repeated approval, and repeated reversal.
- Financial and security-sensitive records cannot be hard-deleted after use.
- Corrections use cancellation during grace, rejection, void, reversal, deactivation, or end-dating according to lifecycle.
- Audit events include society, actor, action, target, timestamp, reason, request correlation, and before/after data where applicable.
- Reversal records identify the original transaction, use the opposite direction, match required amount/fund/society dimensions, and cannot be applied more than once.
- Created and updated timestamps are maintained consistently by application/database behavior rather than relying on callers.
- The PWA may cache its static shell, but Phase 1 financial mutations require connectivity. Offline financial queues are prohibited.
- Secrets, local environments, build outputs, and dependency directories must not be committed.

## Testing Decisions

- Tests assert external behavior and durable outcomes, not internal function calls, component structure, ORM implementation, or private queue mechanics.
- The highest acceptance seam is a mobile-sized PWA journey through the deployed-style HTTP API into a real PostgreSQL test database.
- Existing browser end-to-end testing patterns are extended to cover invitation, registration, password login, role-sensitive navigation, billing publication, receipt entry and Undo, finalized receipt delivery state, expense approval, imports, notifications, and reports.
- API/database integration tests are the second necessary seam because browser tests cannot reliably prove transaction isolation, constraints, idempotency, or concurrency behavior.
- Supabase, WhatsApp/SMS, push, PDF storage, and queue providers are exercised through explicit provider contracts and deterministic test doubles in the application suite. Provider-specific smoke tests verify production configuration separately.
- Authentication tests cover invited-number registration, rejection of uninvited numbers, exact normalized-mobile matching, OTP verification, existing-person linking, password login, recovery, revoked/expired invitations, consumed-token replay, resend invalidation, duplicate mobile rejection, invalid JWTs, and disabled memberships.
- Authorization tests exercise every role and sensitive action, multiple-role permission union, society scoping, platform-admin separation, role revocation, and rejection of owner/tenant/vendor registration as staff without an explicit staff invitation.
- Billing integration tests cover every frequency, anchor and month-end behavior, due-date clamping, one-time periods, category-specific rates, effective-date boundaries, cycle configuration, draft totals, publication, retries, concurrent generation, void, and replacement.
- Receipt integration tests cover exact payment, part payment, arrears, several periods, override allocation, advance creation, future advance consumption, concurrent allocation, wrong-flat rejection, and atomic rollback.
- Receipt-timing tests use a controllable clock to verify the 15-minute boundary, state transitions, single Undo, canceled document delivery, automatic finalization, number assignment only at finalization, number uniqueness, and race behavior between Undo and finalization.
- Finalized-receipt tests verify admin-only void, complete balanced reversal, cancellation delivery, replacement independence, immutable PDF snapshot, and non-reuse of receipt numbers.
- Cash tests verify opening balance, pending-finalization and finalized receipt movements, expense movements, same-period and later-period reversal effects, collector daily totals, admin handover acknowledgment with no balance effect, and the closing-cash equation.
- Expense tests cover committee submission, no pre-approval balance effect, admin approval/rejection, admin direct posting, attachment threshold, installments, recurring draft generation, idempotency, and reversal.
- Fund tests prove charge publication creates no movement; each receipt allocation, designated advance, and approved expense posts exactly once; applying advance does not credit a fund twice; payment allocations credit the correct funds; expense debits use the selected fund; and reversals negate the original movement.
- Import tests cover each template, malformed rows, duplicate detection, previews, confirmation, all-or-nothing failure, retry idempotency, checksums, opening dimensions, and report inclusion.
- Notification tests verify in-app persistence, unread badge, PWA push attempts, WhatsApp-to-SMS fallback, secure receipt-link isolation, retries, revocation, and non-rollback of financial commits.
- Report tests build known ledgers and verify opening, receipt, expense, and closing totals for monthly and arbitrary ranges, including migration, advances, parts, a report generated during the receipt finalization window, voids/reversals in later periods, and timezone boundaries.
- Cash-only contract tests reject bank transfer, UPI, cheque, other payment methods, and any money account other than the society's seeded `CASH_ON_HAND` account.
- Flat-assignment tests cover overlap rejection, scheduled turnover, tenant-first recipient selection, owner fallback, and recipient snapshot stability across later assignment changes.
- The pilot statement is encoded as an acceptance fixture: opening cash 206,394; receipts 120,200; expenses 82,300; expected closing cash 244,294.
- Responsive tests cover supported phone and desktop viewports, installability, home-screen guidance, notification permission states, and online-only mutation messaging.
- Security tests cover unguessable receipt access, cross-society denial, expired/revoked links, minimum disclosed payer data, unauthorized exports, injection-safe imports, upload restrictions, and rate limits on OTP and authentication endpoints.
- Release acceptance requires all critical PWA journeys, API/database integration tests, schema migration tests, linting, type checking, and production build checks to pass.

## Out of Scope

- Resident, owner, tenant, vendor, facility-manager, and security-guard login roles.
- Resident complaints, service requests, generic task management, visitor management, security incidents, projects, checklists, and SLA workflows.
- Multi-society user experience, society switching, self-service society creation, and cross-society staff relationships.
- Native iOS, native Android, and React Native applications.
- Bank accounts, UPI, cheque, bank reconciliation, collector cash-account transfers, and non-cash payment entry.
- Full double-entry accounting, chart of accounts, journals, trial balance, formal balance sheet, income statement, accounts payable, and statutory audit statements.
- GST, TDS, payroll, procurement, inventory, asset management, and tax reporting.
- Variable/formula/area-based maintenance, percentage charges, discounts, late fees, penalties, and interest.
- Splitting one expense across several funds.
- Automatically posting recurring expenses or deducting cash without completed entry and approval.
- Custom role creation or editable permission mappings.
- Mobile-number change and shared mobile numbers.
- Offline financial writes or background mutation synchronization.
- Pixel-identical reproduction of the pilot PDF; equivalent data, totals, drill-down, PDF export, and spreadsheet export are required.
- Complete historical migration when source records are unavailable; optional validated history import remains supported.

## Further Notes

- “Main Fund” and “Sinking Fund” are pilot defaults, not hard-coded universal names.
- “Half-yearly” means twice per year. “Biennial” is not used for the pilot configuration.
- The owner or tenant receiving a receipt remains a non-login contact in Phase 1. Receipt delivery therefore cannot depend on an authenticated resident portal.
- SMS cannot carry a PDF attachment in the same way as WhatsApp. Its fallback message links to a secure receipt-only PWA page and PDF.
- PWA push is best-effort. The in-app notification record and badge are the durable staff experience.
- Collector handover acknowledgment records responsibility but does not prove physical cash through a separate ledger account. Phase 1 reports should label balances as recorded cash and collection acknowledgment clearly.
- The initial schema's configuration and financial concepts should be preserved where they satisfy this specification, but table design, constraints, states, and relationships may be replaced where required.
- The issue tracker is not configured in the repository. This specification remains local until a remote tracker and `ready-for-agent` triage vocabulary are configured.

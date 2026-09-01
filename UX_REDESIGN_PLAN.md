# Manzil OS Mobile UX Redesign Plan

## Scope Of This Phase

This document audits the current frontend and defines the redesign sequence. It does
not authorize a single large rewrite. Each implementation slice begins with one
failing user-visible test, makes the minimum production change to pass, and is
verified on phone viewports before the next slice starts.

## Current Product Audit

### What Already Works

- Mobile has a bottom navigation and safe-area padding.
- Receipt entry already defaults date, Main Fund, receipt type, payer, and category
  amount. The best-case task is select flat, then submit.
- Expense entry defaults date, fund, and category.
- Reports load the current month automatically and support useful presets.
- Shared primitives already include sheets, dialogs, alerts, forms, command search,
  skeletons, tabs, and toasts.
- The 39 current Vitest tests pass.

### Highest-Risk Problems

1. No Cypress flow submits a receipt or expense or reconciles either in the cashbook.
2. Receipt success is toast-only and leaves the completed values ready to resubmit.
3. `Undo` immediately voids a financial record with no confirmation or reason.
4. Receipt and expense screens mix fast entry, filters, history, and administrative
   actions into long web-style pages.
5. Required payer/vendor/narration behavior is missing or unclear despite the PRD.
6. Loading and request failures often look like genuine empty data.
7. Shared controls are commonly 28-32px high, below mobile touch guidance.
8. Lists expose UUID fragments, API enums, and implementation terms instead of people,
   flats, and plain-language status.
9. Reports use a five-column table and raw JSON dialogs on phones.
10. Role-sensitive navigation is inconsistent; collectors can see routes they cannot
    use, while report authorization reads roles differently from the shell.
11. The Phase 1 product is explicitly single-society, but demo switching can change
    the label without reliably changing cached data scope.
12. Financial date defaults use UTC on receipt/expense screens and can be one day
    behind in Asia/Kolkata after local midnight.
13. Offline financial writes are prohibited, but connectivity is not shown before a
    user submits.
14. The Cypress suite contains stale `Billing` and `Fund balance` assertions, forced
    clicks, fixed waits, and CSS-structure selectors.

## Target Information Architecture

### Administrator

| Destination | Purpose |
| --- | --- |
| Home | Today’s cash position, recent activity, pending attention, quick actions |
| Collect | Search a flat and record maintenance |
| Spend | Record and review expenses |
| Reports | Cashbook summary, activity, export, and drill-down |
| More | Flats, people, funds, categories, installation, account |

### Collector

Show only destinations and actions the role can use. The collector lands on Collect
or can reach it in one tap. Reports/master data remain hidden unless the backend role
contract explicitly permits a limited view.

The bottom navigation is persistent only at top-level destinations. Full-screen
selection and confirmation sheets temporarily cover it. Sticky financial actions sit
above it and the safe area.

## Screen And Flow Redesign

### Login

**Current weakness:** The layout is web-form oriented, production may still expose
demo entry, feedback is plain text, and the OTP flow has limited recovery states.

**Mobile interaction:** Use one focused authentication card with phone-native numeric
entry, a clear step transition, resend timer, change-number action, and keyboard-safe
primary button. In standalone mode, avoid excess browser-oriented explanation.

**Shortest flow:** Demo remains one tap only in mock builds. Production login remains
phone, OTP, verify; returning users should keep their intended destination.

**Components:** App mark, PhoneField, OTPField, StickyAction, InlineAlert, LoadingButton.

### Home

**Current weakness:** It is a route directory with development-scope copy, not an
operational dashboard. Cards look tappable but only a small `Open` link works.

**Mobile interaction:** Show the current recorded-cash summary, today’s received/paid
totals, and two large quick actions. Follow with a compact recent-activity list and
attention items. Make the complete card or row actionable.

**Shortest flow:** Record receipt or expense in one tap from Home. Do not force Home
between repeat entries.

**Components:** BalanceHero, MetricPair, QuickAction, ActivityRow, EmptyState, Skeleton.

### Collect / Receipts

**Current weakness:** Fast entry shares one page with admin filters, totals, PDF,
WhatsApp, void history, and technical copy. Flat selection is not searchable. Payer
is a faint hint, validation is toast-only, and success leaves duplicate-ready values.

**Mobile interaction:**

1. Open with a searchable `Choose flat` control and recent flats.
2. After selection, show one flat summary containing payer, mobile, default amount,
   and relevant due context available from the current API.
3. Show a large amount input.
4. Collapse date, fund, type, and narration under `Details`, while making all defaults
   visible in a compact summary row.
5. Keep `Record ₹X` in a keyboard-safe sticky action bar.
6. Show a durable success sheet with amount, flat, payer, date, receipt number/status,
   and `Record another` / `View receipt` / share actions.
7. Put history in a peer `Activity` view or route, with filters in a bottom sheet.
8. Replace immediate `Undo` with the lifecycle the backend actually supports. If the
   record is already final, use `Void receipt`, require a reason, and confirm impact.

**Shortest flow:** Select/search flat, verify the prefilled amount and payer, tap
`Record ₹X`: two decisions. Details require no action when defaults are correct.

**Components:** EntitySearchSheet, FlatSummary, MoneyField, DetailsDisclosure,
StickyAction, SuccessSheet, FinancialRow, FilterSheet, ConfirmDestructiveSheet,
OfflineBanner.

### Spend / Expenses

**Current weakness:** Existing vendors cannot be selected during entry, required PRD
fields are optional, the form is a vertical web card, and history/filters compete with
entry. Raw IDs and ISO timestamps appear in rows.

**Mobile interaction:** Lead with amount, then a searchable vendor field that supports
`Create “name”` inline. Show recent categories as thumb-friendly choices and place
fund/date/narration in a details section with visible defaults. Keep a sticky
`Record expense` action. Move history and filters into Activity and FilterSheet.

**Shortest flow:** Enter amount, choose recent vendor, choose category if the default
is not appropriate, record. Inline vendor creation adds one explicit confirmation,
not a detour to settings.

**Components:** MoneyField, CreatableEntitySearch, ChoiceChips, DetailsDisclosure,
Textarea, StickyAction, SuccessSheet, FinancialRow, FilterSheet.

### Reports

**Current weakness:** Notifications, report history, exports, opening balance, range,
summary, transactions, and raw details compete on one screen. Date fields refetch
independently. The statement is a desktop table on mobile.

**Mobile interaction:** Use a sticky range segmented control with `Today`, `Week`,
`Month`, and a custom-range sheet. Lead with closing cash, then the equation as three
drillable metric rows. Render transactions as a chronological mobile list. Open
source details in a semantic bottom sheet. Put export/print/history in the top-right
overflow menu. Keep opening-balance editing in a contextual admin sheet.

**Shortest flow:** Current month requires zero action. A preset is one tap. Custom
range is open, choose range, apply, preventing intermediate invalid requests.

**Components:** SegmentedControl, BalanceHero, MetricRow, FinancialRow, DetailSheet,
RangeSheet, OverflowMenu, Skeleton, InlineAlert.

### Flats And People

**Current weakness:** Categories, flats, contacts, assignments, dues, ledger, and XLSX
live behind tabs in one dense page. `Select` has unclear side effects and assignment
updates can leave stale data.

**Mobile interaction:** More opens a grouped settings list. `Flats` becomes a
searchable list; tapping a flat opens its detail route/sheet with occupants, amount,
due, and ledger. Add/edit actions use focused sheets. People and categories are
separate grouped settings destinations. Avoid horizontal tab bars for unrelated
entities.

**Shortest flow:** Search flat, open detail: two actions. Add occupant begins from the
flat, so the flat is already known. Add a contact inline only when needed.

**Components:** SettingsGroup, SearchField, EntityRow, FlatDetailSheet, FormSheet,
StatusBadge, LedgerList, EmptyState.

### Funds, Vendors, And Categories

**Current weakness:** Three data types share a tabbed CRUD page with small controls and
little state feedback.

**Mobile interaction:** Present each as a More/settings row with count and summary.
Each destination uses a searchable entity list and an add/edit sheet. Deactivation is
a contextual row action with impact explanation.

**Shortest flow:** More, destination, add: three actions. Expense entry still supports
inline vendor creation so daily work never detours here.

**Components:** SettingsGroup, EntityList, FormSheet, ContextMenu, StatusBadge,
ConfirmDestructiveSheet.

### Notifications And More

**Current weakness:** The badge counts all notifications as unread, rows do not deep
link, installation is unexplained, and mobile More only exposes two configuration
destinations.

**Mobile interaction:** Make Notifications a full-height sheet with unread state and
actionable rows. More becomes a grouped mobile settings screen containing operational
setup, app installation, connectivity/about, and account/sign-out.

**Shortest flow:** Notification opens its source in one tap. Installation guidance is
shown only when install is possible or on explicit request.

**Components:** NotificationSheet, NotificationRow, Badge, SettingsGroup,
InstallPromptCard, AccountRow.

## Cross-Cutting Behavior

### One-Handed Use

- Keep record actions and frequent choices in the lower two-thirds.
- Use 48px primary controls and 44px minimum secondary targets.
- Do not place destructive actions next to common actions without separation.
- Full-row taps replace small inline links.

### Keyboard And Safe Areas

- Sticky actions follow the visual viewport when the software keyboard opens.
- Focused fields scroll into view with enough bottom padding for the action bar.
- Header, navigation, sheets, and standalone launch use safe-area insets.

### Perceived Performance

- Keep prior data visible during refresh.
- Use route-level skeletons only on first load.
- Optimistically update low-risk preferences and reversible local UI state.
- Do not optimistically confirm financial writes; show pending immediately and success
  only after the API confirms the transaction.

### Financial Safety

- Disable mutation while offline and explain why.
- Block repeat submission while pending.
- Keep form values on failure.
- Show a persistent success summary after confirmation.
- Match `Undo`, `Void`, and `Reverse` labels to real backend lifecycle semantics.

## Test Audit And Required Seams

### Existing Baseline

- Vitest/RTL: 13 files, 39 passing tests at audit time.
- Cypress: 3 specs, mostly demo/MSW master-data coverage.
- No current Cypress test submits a receipt or expense or verifies the cashbook result.
- Current E2E uses forced clicks, fixed waits, CSS-class traversal, random data, and at
  least two stale assertions.
- Layout, keyboard, safe-area, accessibility, standalone, and offline behavior have no
  meaningful automated protection.

### Proposed Public Test Seams

These seams must be approved before the first redesign test is written.

1. **RTL + MSW user-visible component/flow seam:** render a routed screen, interact by
   role/name/label, and assert visible state plus public HTTP requests. Do not inspect
   Zustand, hook calls, internal arrays, CSS classes, or private component state.
2. **Cypress mobile browser seam:** use the app through visible controls at 375x812 and
   360x800. Assert navigation, focus, actionable layout, feedback, and persisted
   outcomes. Avoid forced clicks and arbitrary waits.
3. **Vertical financial acceptance seam:** Cypress through deployed-style HTTP into a
   real test backend/PostgreSQL for receipt, expense, report, and ledger reconciliation.
   Keep MSW browser tests as fast interaction coverage, not proof of accounting.
4. **Production PWA seam:** build plus preview for manifest, service-worker registration,
   offline shell, standalone navigation, and online-only financial messaging.

### Tests Before Redesign

1. Fix stale shell assertions using current visible outcomes.
2. Add deterministic fixture reset for browser MSW.
3. Add one failing receipt flow test: choose flat, verify payer/default amount, record,
   see durable confirmation, and prevent double submission.
4. Add one mobile Cypress flow for receipt entry without forced clicks.
5. Add financial failure tests: offline/request failure preserves values and announces
   recovery.
6. Add void safety test at the user-visible seam before changing the action.

Do not bulk-write all future tests. Continue one failing test, one minimal change, one
green verification per vertical slice.

## Vertical Slice Sequence

### Slice 0: Trustworthy Test Harness

**Outcome:** Existing tests describe the current product reliably.

- Replace stale Cypress assertions.
- Reset mock data deterministically.
- Add mobile viewport helpers and role/label selectors.
- Separate MSW browser integration from real-backend acceptance commands.
- No visual redesign yet.

### Slice 1: Receipt Collection Core

**Outcome:** The highest-frequency flow is a two-decision, thumb-friendly collection
with explicit payer/defaults, durable success, duplicate protection, and failure
recovery.

- Add receipt-flow tests first.
- Introduce only the tokens/primitives needed by this slice.
- Split entry from administrative activity on mobile.
- Add searchable flat sheet, amount field, details disclosure, sticky action, and
  success sheet.
- Preserve existing receipt fields and API behavior.

### Slice 2: Receipt Activity And Safe Corrections

**Outcome:** Staff can find, share, resend, and safely correct receipts without an
accidental one-tap void.

- Test history, filter, and correction behavior first.
- Use human-readable flat, collector, date, and status data.
- Add filter/detail sheets and lifecycle-correct destructive confirmation.

### Slice 3: Expense Entry And Activity

**Outcome:** Required expense data is fast to enter, existing vendors are selectable,
and inline creation remains available.

- Test required fields and visible persistence first.
- Reuse receipt primitives rather than creating parallel styles.
- Reconcile one created expense in the report acceptance flow.

### Slice 4: Cashbook Report

**Outcome:** Current cash and its source movements are understandable without a
desktop table.

- Test preset/custom ranges, equation, drill-down, and error states first.
- Build mobile financial rows and semantic detail sheets.
- Add print-specific shell hiding and retain wide-screen/print table where useful.

### Slice 5: App Shell And Home

**Outcome:** Navigation is role-correct, operational, install-aware, and consistent in
browser and standalone display.

- Test admin/collector destinations, More, sign-out, and deep links first.
- Implement the tokenized app shell and operational Home.
- Remove or correctly scope society switching for the single-society product.

### Slice 6: Flats, People, And Configuration

**Outcome:** Setup becomes searchable mobile settings and contextual flat detail,
without disrupting daily collection.

- Test the highest-value setup task before each sub-slice.
- Reuse entity lists, sheets, status badges, and empty/error states.
- Preserve current APIs and ledger/export functionality.

### Slice 7: PWA, Accessibility, And Motion Hardening

**Outcome:** The redesigned app behaves consistently across supported phone sizes,
standalone mode, keyboard states, reduced motion, and connectivity changes.

- Add build-preview PWA tests and representative axe checks.
- Verify focus management, 200% text, safe areas, offline blocking, and Android/iOS
  viewport behavior.
- Audit motion against reduced-motion settings and performance budgets.

## Definition Of Done Per Slice

- One approved public seam and red test exists before production code.
- The slice is demoable end-to-end and preserves existing functional contracts.
- All touched states include loading, empty, error, success, pending, and disabled where
  applicable.
- No one-off visual values bypass `DESIGN.md` tokens/primitives.
- Phone viewports have no unintended horizontal page scroll or hidden action.
- Touch targets, labels, focus, contrast, and reduced motion meet the system rules.
- Smallest relevant tests, full frontend tests, lint fix, typecheck/build, and relevant
  Cypress profile pass.

## Explicit Non-Goals For The First Slice

- No whole-app restyle.
- No backend lifecycle invented to imitate native behavior.
- No new offline mutation queue.
- No master-data rewrite.
- No speculative animation framework.
- No one-off receipt-only component styles that cannot serve later slices.

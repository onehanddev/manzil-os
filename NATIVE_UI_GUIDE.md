# Native UI Guide — Manzil OS

This guide captures the **native app decisions** made during the Slice 2 + follow-up redesign (chat 2026-09-01). Future screens and edits must follow these patterns instead of web defaults. It is referenced from `AGENTS.md` → *What to Read First* and is the first file to check for any frontend UI work.

## 1. Why Native

Web defaults (small `Select` dropdowns anchored to the trigger, `Input type="date"` browser popovers, top-center `sonner` toasts, whole-page scroll) feel like a website. Manzil OS is a **PWA that must feel like iOS/Android**: bottom sheets, 48px targets, and a fixed shell where only content scrolls.

Reference inspiration: iOS Settings (grouped lists + bottom sheets), Apple Calendar (month grid drawer), Android Material bottom sheets, and any tabbed native screen where **header + tabs stay fixed and only the panel below scrolls**.

---

## 2. App Shell — What Scrolls

### Structure (see `frontend/src/app/layouts/app-shell.tsx`)

```
┌─ header (sticky top-0, h-14, safe-area-inset-top, backdrop-blur)
├─ tab bar / segmented control (sticky below header, 44-48px, bg-muted p-1)
└─ scrollable panel ← ONLY this scrolls
└─ bottom nav (fixed inset-x-0 bottom-0, h-16 + safe-area-inset-bottom)
└─ sticky action bar (above bottom nav, safe-area-aware)
```

**Rule:** The page itself (`<main>`, `<body>`) must not scroll. Only the section **below the tabs/segmented control** scrolls. Headers, tab bars, and bottom nav are fixed. On `h-[100dvh]` with `viewport-fit=cover`, use:

```tsx
<div className="flex h-[calc(100dvh-3.5rem-4rem)] flex-col overflow-hidden">
  <div role="tablist" className="shrink-0 ...">Record | Activity</div>
  <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-28">
    {/* panel content */}
  </div>
</div>
```

- `overflow-y-auto` + `overscroll-contain` on the panel, `overflow-hidden` on the outer.
- Inside panels keep `space-y-4` but do **not** put `min-h-[100dvh]` on the panel.
- Existing implementations: `frontend/src/pages/receipts.tsx` (Record/Activity tabs), `frontend/src/pages/expenses.tsx` (Record/Activity tabs). Both use this pattern.

### Safe Areas & Viewports

- Use `100dvh`, `env(safe-area-inset-*)` on header, nav, sheets, and sticky actions.
- Support 320px without horizontal scroll; verified at 375×812 and 360×800.
- `pb-28` on scrollable panel to clear sticky action + bottom nav.

---

## 3. Native Primitives — Use These, Not Web Controls

| Web default | Native replacement | File | When to use |
|---|---|---|---|
| `Select` / `SelectTrigger` + `SelectContent` dropdown anchored to trigger | `MobileSelect` bottom drawer | `frontend/src/components/ui/mobile-select.tsx` | Every dropdown, filter, category, flat/fund/vendor selection |
| `Input type="date"` browser popover | `NativeDateField` calendar drawer | `frontend/src/components/ui/native-date-field.tsx` | Every date: `business_date`, filter `From`/`To`, report range |
| `sonner` top-center toast | Native bottom toast | `frontend/src/components/ui/sonner.tsx` + `frontend/src/app/App.tsx` | Every `toast.success/error` (financial writes, validation) |
| Inline filter card mixed with form | `FilterSheet` bottom sheet + tab separation | `frontend/src/pages/expenses.tsx`, `frontend/src/pages/receipts.tsx` | Filters must not live on the same scroll as the form |
| Small web dialog | `Sheet` bottom / `Dialog` centered | `frontend/src/components/ui/sheet.tsx`, `dialog.tsx` | Detail, filter, destructive confirm |

### 3.1 MobileSelect — Bottom Drawer, Not Dropdown

**Why:** On mobile, a dropdown that opens *below* the trigger forces thumb stretch and hides behind the keyboard. Native apps open a full drawer.

**File:** `frontend/src/components/ui/mobile-select.tsx:26`

**API:**
```tsx
<MobileSelect
  value={fundId} onValueChange={setFundId}
  options={funds.map(f=>({value:f.id, label:f.name}))}
  placeholder="Select fund" label="Fund" ariaLabel="Fund"
  testId="expense-fund-select" searchable
/>
```

**Behavior:**
- Trigger: `button role="combobox" aria-expanded aria-haspopup="listbox"` — min-h-12, border, shows selected label + chevron. Keeps `data-testid` for RTL `getByTestId` / `getByRole('combobox')` compat.
- Drawer: `Sheet side="bottom"` `max-h-[min(88dvh,600px)]`, drag handle (`h-1 w-10 rounded-full bg-border`), searchable when `>5` options (`Search` + `Input h-11 pl-9`), list `role="listbox"` with options `role="option" min-h-[52px] rounded-xl`, selected `bg-primary`, check icon.
- Do **not** use `Select` anywhere for mobile — even on desktop it should be a drawer for consistency.

**Examples in repo:** Flat picker with `description: "₹1500"` (`receipts.tsx:278`), Fund/Category/Vendor in Expenses, Filters drawer.

### 3.2 NativeDateField — Calendar Drawer, Not Browser Popover

**Why:** `Input type="date"` browser popovers are inconsistent across Android/iOS/desktop and feel web-like. Native apps show a bottom calendar drawer.

**File:** `frontend/src/components/ui/native-date-field.tsx:20`

**API:**
```tsx
<NativeDateField value={date} onChange={setDate} label="Date" id="receipt-date" ariaLabel="Date" />
```

**Behavior:**
- Visible field: `Input type="date" h-12` + calendar button `aria-label="Open calendar"` at right-1, plus formatted preview `31 Aug 2026` below (`formatDisplay`). Keeps `getByLabelText` / `clear` / `type` for tests while also offering native UX.
- Drawer: `Sheet side="bottom"` with:
  - Formatted preview `rounded-2xl border bg-muted/20`
  - Quick row `Today` / `Clear`
  - Month grid: header `May 2026` with prev/next `ChevronLeft/Right` (icon-sm), weekday row `Mon..Sun`, 42-cell grid `h-10 rounded-xl` — selected `bg-primary`, today `bg-accent ring-1`, `aria-label="Select 2026-09-01"`
  - Fallback precise `Input type="date" id="{id}-picker"` + `Cancel`/`Done` (h-12)
- Local date formatting via `new Date(iso+"T12:00:00")` + `toLocaleDateString('en-GB')` to avoid TZ shift; `todayISO()` for Today button matches `ReportsPage` local `fmt` (`frontend/src/pages/reports.tsx:63`).

**Rule:** If a native-feeling calendar is not possible for a given context, **skip the drawer** (`Input type="date"` alone) rather than shipping a web-like popover anchored to the input. Prefer the drawer everywhere we already have it.

### 3.3 Native Toast — Bottom, Not Top

**Files:** `frontend/src/components/ui/sonner.tsx:7`, `frontend/src/app/App.tsx:19`

**Config:**
```tsx
<Sonner position="bottom-center" expand={false} visibleToasts={2}
  style={{ "--border-radius":"999px", bottom:"calc(88px + env(safe-area-inset-bottom))" }}
  toastOptions={{ classNames: {
    toast:"group flex min-h-12 max-w-[min(92vw,380px)] rounded-2xl border bg-popover/90 px-4 py-3 shadow-[0_8px_32px_rgb(23_32_30/0.18)] backdrop-blur-xl data-[type=success]:bg-emerald-50/95"
  }}}
/>
```

- Centered pill at bottom, above bottom nav, `backdrop-blur-xl`, `rounded-2xl`, `shadow`, safe-area aware.
- `App.tsx` no longer passes `position="top-center"` — `Sonner` defaults to bottom.
- Remove or keep `frontend/cypress/support/e2e.ts` harness that forced `top→bottom` via CSS; native position now handles it.

### 3.4 Sheets — Every Overlay Is a Drawer

- Use `Sheet side="bottom"` with drag handle (`mx-auto mb-2 h-1 w-10 rounded-full bg-border`), `max-h-[92dvh]`, `pb-[env(safe-area-inset-bottom)]`, `overflow-y-auto` panel.
- Primitives already in use:
  - `FilterSheet` (receipts & expenses) — From/To (`NativeDateField`) + `MobileSelect`s + `Apply filters`/`Clear` (h-12 grid).
  - `DetailSheet` (receipt) — amount, flat, payer, `Download PDF` / `Resend WhatsApp` / `Void receipt`.
  - `ConfirmDestructiveSheet` via `Dialog` for Void (requires `Reason` + impact text *This will remove ₹X from totals but keep history*) — see `frontend/src/pages/receipts.tsx:532` (`voidConfirmOpen`).

---

## 4. Screen Structure — Record vs Activity Tabs

**Anti-pattern (fixed):** Long page mixing form + filters + list. Expenses previously had `Card` Record + `Card` Filters (5 fields) + `Card` List all in one scroll.

**Native pattern (now in `expenses.tsx:140`, `receipts.tsx:247`):**

```tsx
<div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
  <button role="tab" aria-selected={activeTab==='record'} ...>Record</button>
  <button role="tab" aria-selected={activeTab==='activity'} ...>Activity{filterCount?' · 3':''}</button>
</div>
{activeTab==='record' ? <Card id="...-record-panel" role="tabpanel">…form…</Card>
 : <div id="...-activity-panel" role="tabpanel" className="space-y-3">
      <div className="flex items-center justify-between"><h2>Recent…</h2><Button aria-label="Filters" onClick={()=>setSheet(true)}>Filters</Button></div>
      <Card>…list rows min-h-[64px]…</Card>
      <Sheet>…filters…</Sheet>
   </div>}
```

- Only **one** primary action per view (DESIGN.md).
- Filters **never** live inline with the form — they are in a `FilterSheet` bottom drawer, opened via `Filters` button. The list and filters are peers, not siblings of the form.
- Tabs are `h-11` (44px min per `DESIGN.md` Segmented Control).

**Checklist for a new tabbed screen:**

- [ ] Fixed header + tab bar (shrink-0)
- [ ] Scrollable panel below tabs is the *only* scroller (`flex-1 overflow-y-auto`)
- [ ] No filter card in the Record view
- [ ] FilterSheet + list in Activity view
- [ ] Every trigger uses `MobileSelect`/`NativeDateField`, not `Select`/`Input type="date"` alone
- [ ] Tests switch tabs via `getByRole('tab', {name:/Activity/i})` before asserting list/filter UI (see `frontend/src/pages/expenses.test.tsx:194`, `receipts-activity.test.tsx:62`)

---

## 5. Inputs & Touch Targets

- All triggers, inputs, buttons: `min-h-12` (48px), secondary `h-11` (44px min). Amount field may be `h-12 text-base` or `64px + 28px tabular` for hero money.
- Dropdown rows: `min-h-[52px] rounded-xl`.
- Preserve `8px` between adjacent targets, `Label` remains visible, placeholder is example only.
- Keep focused controls above keyboard via `scroll-padding-bottom` and visual-viewport-aware sticky action (DESIGN.md).

---

## 6. How This Was Built (So You Repeat It)

1. **Slice 2 Receipt Activity** added `suffix` formatting (`formatCurrency`, `formatDateShort`), `StatusBadge` (`Recorded`/`Voided`), detail + filter sheets, and `Void receipt` with required `Reason`. Tests at `frontend/src/pages/receipts-activity.test.tsx:14`.
2. **Cross-cutting native** replaced every `Select` with `MobileSelect` drawer, `Input type="date"` with `NativeDateField` drawer + calendar grid, and top `sonner` with bottom native toast. Integrated in `receipts.tsx` and `expenses.tsx`.
3. **Bombardment fix** split `expenses.tsx` (and later `receipts.tsx`) into `Record`/`Activity` tabs; filters moved to `Sheet`. Updated `expenses.test.tsx:194` to open filter sheet via `Filters` button.
4. **Scroll containment** made only the panel below tabs scrollable (this guide section 2). Verify at `375×812` and `360×800` with no horizontal scroll.

---

## 7. What to Do for a New Screen

1. Read `DESIGN.md`, `UX_REDESIGN_PLAN.md`, and this file first (see `AGENTS.md`).
2. Scaffold with native primitives — do **not** import `Select` for mobile. Use `MobileSelect`/`NativeDateField` + `Sheet` + bottom `Toaster`.
3. Structure with fixed tabs/shell + single scrollable panel. Do **not** put the whole `<main>` into scroll when tabs exist.
4. Write one failing RTL+MSW test per vertical behavior *before* code (see `skills/tdd/SKILL.md`), interact by `role`/`label`, and assert visible outcome + sheet state.

---

## 8. Files to Copy

- `frontend/src/components/ui/mobile-select.tsx` — bottom drawer select
- `frontend/src/components/ui/native-date-field.tsx` — native calendar drawer
- `frontend/src/components/ui/sonner.tsx` — bottom native toast
- `frontend/src/pages/expenses.tsx:140` — tab + filter sheet pattern
- `frontend/src/pages/receipts.tsx:247` — Record/Activity + filter/detail/void sheets

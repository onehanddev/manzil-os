# Manzil OS Design System

## Product Character

Manzil OS is a daily cashbook for residential-society staff. It should feel calm,
fast, and accountable: warm enough for daily use, precise enough for financial
records, and simple enough to operate one-handed at a society desk or doorway.

The visual direction is **warm utility**. Soft paper neutrals and rounded surfaces
make the app approachable. Deep teal communicates trust and anchors primary actions.
Amber is used sparingly for pending work. Financial state is communicated with text
and icons as well as color.

The memorable product behavior is: **select a flat, verify the money, record it with
confidence**.

## Principles

1. Put the next action within thumb reach.
2. Default what the system knows; show defaults before submission.
3. Keep one primary action per view or sheet.
4. Show financial success explicitly; never imply success from disappearance alone.
5. Keep configuration out of operational flows until it is needed inline.
6. Prefer sheets, inline expansion, and direct manipulation over small web dialogs.
7. Use motion to explain state changes, not decorate static content.
8. Require connectivity and explicit completion for financial mutations.

## Color

Use semantic token names in components. Raw values belong only in the token layer.
All foreground/background pairs must meet WCAG 2.1 AA contrast.

### Brand And Surfaces

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `background` | `#F7F5EF` | `#101817` | App canvas, warm paper |
| `surface` | `#FFFFFF` | `#17211F` | Cards, sheets, navigation |
| `surface-subtle` | `#EFEEE7` | `#1E2A27` | Grouped rows, secondary areas |
| `surface-raised` | `#FFFFFF` | `#23302D` | Floating and selected surfaces |
| `text` | `#17201E` | `#F3F6F4` | Primary content |
| `text-muted` | `#65716D` | `#A8B2AE` | Supporting content |
| `border` | `#DDE2DD` | `#33423E` | Dividers and control boundaries |
| `primary` | `#176B63` | `#5EC3B4` | Primary action and active navigation |
| `primary-strong` | `#0E514B` | `#82D8CA` | Pressed state and high-emphasis text |
| `on-primary` | `#FFFFFF` | `#10201D` | Content on primary |
| `accent` | `#D9952F` | `#F2B95C` | Attention, highlights, pending count |
| `accent-subtle` | `#FFF2D7` | `#3A2D18` | Pending and informational surfaces |

### Semantic State

| Token | Light | Use |
| --- | --- | --- |
| `success` | `#16764D` | Recorded, approved, delivered |
| `success-subtle` | `#E5F5EC` | Success panels and badges |
| `warning` | `#A96612` | Pending, offline, needs attention |
| `warning-subtle` | `#FFF1D6` | Warning panels |
| `danger` | `#B53A35` | Void, destructive actions, errors |
| `danger-subtle` | `#FCE9E7` | Error panels and destructive sheets |
| `info` | `#3569A8` | Neutral system information |
| `info-subtle` | `#E8F0FA` | Informational panels |

Do not use green and red as the only distinction between receipts and expenses.
Pair them with `ArrowDownLeft`/`ArrowUpRight`, `Received`/`Paid`, and signed values.

## Typography

Use **Source Sans 3** for interface copy and **DM Sans** for display headings if the
font payload remains within the performance budget. Until those assets are installed,
use the platform stack rather than introducing a third fallback style:

```css
font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

Use tabular figures for money, dates, balances, receipt numbers, and counts.

| Style | Size / line | Weight | Use |
| --- | --- | --- | --- |
| Display | `32 / 38` | 700 | Rare key balance or success amount |
| Title 1 | `28 / 34` | 700 | Screen title |
| Title 2 | `22 / 28` | 650 | Sheet and section title |
| Title 3 | `18 / 24` | 650 | Card title |
| Body | `16 / 24` | 400 | Default mobile copy and inputs |
| Body strong | `16 / 24` | 600 | Rows and important labels |
| Supporting | `14 / 20` | 400 | Metadata and helper text |
| Label | `13 / 18` | 600 | Field and status labels |
| Caption | `12 / 16` | 500 | Timestamps and compact metadata |

Do not use text below 12px. Do not use all caps for sentences. Status labels may use
short uppercase terms only when letter spacing remains readable.

## Spacing

Use a 4px base unit: `0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.

- Screen gutter: 16px below 390px, 20px from 390px, 24px on tablets.
- Section gap: 24px.
- Card padding: 16px compact, 20px standard.
- Control stack gap: 16px.
- Label-to-control gap: 8px.
- Related row gap: 8px.
- Preserve at least 8px between adjacent touch targets.
- Content must clear the bottom navigation, sticky action, keyboard, and safe area.

## Shape

| Token | Value | Use |
| --- | --- | --- |
| `radius-sm` | 8px | Badges and compact controls |
| `radius-md` | 12px | Inputs, buttons, list rows |
| `radius-lg` | 16px | Cards and grouped surfaces |
| `radius-xl` | 24px | Bottom sheets and prominent panels |
| `radius-full` | 999px | Pills and avatars only |

Avoid rounding every nested element. A card may contain flat rows separated by subtle
dividers instead of several smaller cards.

## Elevation

Prefer borders and surface contrast in scrolling content. Use shadows only when an
element floats above another interaction layer.

| Level | Shadow | Use |
| --- | --- | --- |
| 0 | none | Inline surfaces |
| 1 | `0 1px 2px rgb(23 32 30 / 0.06)` | Raised card |
| 2 | `0 8px 24px rgb(23 32 30 / 0.12)` | Sticky action and menus |
| 3 | `0 -12px 40px rgb(23 32 30 / 0.16)` | Bottom sheet |

## Icons

Use Lucide icons consistently at 2px stroke. Standard sizes are 16px inline, 20px in
controls, and 24px in navigation. Icons supplement text; they do not replace labels
for unfamiliar actions. Use filled treatment only for the active bottom-navigation
indicator, not a mixture of unrelated icon families.

## Core Components

### Buttons

- Minimum height: 48px; compact secondary actions may be 44px.
- Primary: solid teal, one per view, verb-led label such as `Record ₹1,500`.
- Secondary: tinted or outlined surface for safe alternatives.
- Tertiary: text/ghost treatment for low-emphasis actions.
- Destructive: danger text by default; solid danger only in the final confirmation.
- Icon button: minimum 44x44px with an accessible name.
- Pending: retain width, show spinner, change label, and block repeat submission.
- Disabled: lower contrast but keep the label readable; never rely on opacity below 50%.

### Inputs

- Minimum height: 48px; amount input may be 64px with 28px tabular numerals.
- Labels remain visible; placeholders are examples, not labels.
- Field error appears below the field, is announced, and moves focus to the first error.
- Use `type`, `inputMode`, `autocomplete`, and `enterKeyHint` appropriate to the data.
- Use a multiline field for narration.
- Searchable entity selection opens a full-height mobile sheet with search and recent
  choices rather than a long select menu.
- Keep focused controls above the software keyboard via `scroll-padding-bottom` and
  visual-viewport-aware sticky actions.

### Segmented Control

Use for 2-4 mutually exclusive, peer-level options such as report range or receipt
type. Minimum height is 44px. Do not use it for primary navigation or long labels.

### Cards And Rows

- Cards group one concept, not every piece of text.
- Entire actionable rows are tappable and at least 52px high.
- Financial rows show title/context left and signed amount right; status and date sit
  below in supporting type.
- Use a pressed state (`scale(0.99)` plus surface change) for immediate touch feedback.
- Avoid desktop tables below 768px. Convert records to stacked rows; retain tables for
  wide screens and print.

### Sheets And Modals

- Use bottom sheets for mobile selection, details, filters, success, and safe actions.
- Use a centered dialog only for short blocking decisions on larger viewports.
- Sheets have a drag indicator, title, close action, internal scroll area, and sticky
  footer when an action is required.
- Sheet maximum height is `min(92dvh, available visual viewport)` and includes bottom
  safe-area padding.
- Destructive confirmation states exactly what changes and whether it can be undone.

### Navigation

- Mobile bottom navigation contains 3-5 role-appropriate destinations.
- Target model: `Home`, `Collect`, `Spend`, `Reports`, `More` for administrators.
- Collectors see only allowed destinations; hidden access must also be enforced by the
  backend.
- Active state uses icon, label, color, and a subtle indicator, not color alone.
- Navigation height is 64px plus `env(safe-area-inset-bottom)`.
- A compact top app bar contains the screen context and at most two actions. Do not
  repeat the product name, society name, page title, and description at equal weight.
- Configuration belongs under More as grouped settings, not in the daily task path.

### Sticky Action Bar

Use for the primary financial action. It sits above bottom navigation, includes
`env(safe-area-inset-bottom)`, and becomes keyboard-safe. The bar must not hide the
last form field. On desktop it returns to normal document flow.

### Status Badge

Statuses use icon, plain-language label, and semantic surface. Prefer `Recorded`,
`Pending`, `Voided`, `Failed`, and `Delivered` over API enum names.

## Feedback States

### Loading

- Preserve layout with skeletons for first load.
- Use inline progress for refresh and mutation; do not replace the entire screen.
- Show a loading label after 300ms to avoid flicker.
- Never render a failed query as a truthful empty state.

### Empty

- Explain what belongs here and provide one relevant action.
- Use a small contextual illustration or icon, not a large decorative scene.
- Example: `No receipts today` with `Record a receipt` for authorized users.

### Success

- Financial writes open a confirmation sheet or persistent inline panel with amount,
  flat/vendor, date, and identifier.
- Offer the next likely action: `Record another`, `Share receipt`, or `View details`.
- Toasts may reinforce success but are never the only evidence.

### Error

- Keep entered values.
- Name what failed and what the user can do: retry, reconnect, or correct a field.
- Use field errors for validation and an inline alert for request failures.
- Technical IDs, enum names, endpoint terms, and stack details never appear in copy.

### Warning

- Use for pending or consequential but recoverable conditions.
- An offline banner states `You’re offline. Financial entries can’t be recorded.` and
  disables the mutation while leaving reading/navigation available.

### Disabled

Disabled controls preserve readable labels and, when the reason is not obvious, show
helper text. Do not make an inaccessible control look active and silently ignore taps.

## Motion And Haptics

- Respect `prefers-reduced-motion` and remove nonessential transforms.
- Touch feedback: 80-120ms.
- Page/section transition: 160-220ms, ease-out.
- Sheet enter/exit: 220-280ms with opacity and vertical translation.
- Success state: one restrained check/amount transition, no confetti.
- Animate height only for small inline disclosure; avoid long layout shifts.
- The web app may call `navigator.vibrate(10)` for supported Android devices after a
  confirmed financial write, but the visual confirmation remains authoritative.

## Mobile And PWA Rules

- Use `100dvh`, `viewport-fit=cover`, and all four safe-area insets where relevant.
- Support 320px width without horizontal page scroll and test 375x812 and 360x800.
- Keep primary controls in the lower two-thirds unless they initiate navigation.
- Do not queue financial writes offline. Static shell caching is allowed.
- Standalone mode must not depend on browser back/refresh controls; every sheet and
  nested route has a visible exit.
- Provide install guidance contextually, not as a blocking first-launch modal.
- Set `theme-color` to match the current top surface and avoid a white browser flash.

## Accessibility

- Meet WCAG 2.1 AA.
- Touch targets are at least 44x44px; primary controls are 48px high.
- Every control has a visible label or accessible name.
- Focus is visible, enters sheets/dialogs, and returns to its trigger.
- Status changes use `role="status"`; errors use `role="alert"` as appropriate.
- Support 200% text zoom and browser font scaling without clipping actions.
- Never encode receipt/expense, active/inactive, or success/error using color alone.

## Content Style

Use familiar financial language and short verbs.

- Use `Record receipt`, not `Submit receipt (POSTED)`.
- Use `Date`, not `business_date`.
- Use `Default amount`, not `maintenance_amount`.
- Use `Recorded by`, not `collected_by`.
- Use `Void receipt` for an audited destructive action; reserve `Undo` for a real,
  time-limited reversible action.
- Format currency as `₹1,500` and local dates as `31 Aug 2026` in display copy.

## Implementation Rule

Tokens and shared primitives are implemented before page-specific styling. A page may
compose primitives but must not introduce one-off colors, radii, shadows, control
heights, loading patterns, or financial status treatments.

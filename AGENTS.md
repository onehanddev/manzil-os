# AGENTS.md — Manzil OS

This file is the operating context for any AI agent working in this repository.

## Project

Manzil OS is a society cashbook and maintenance pilot (Phase 0) — mobile-first PWA + FastAPI + PostgreSQL.
See `PHASE_0_PRD.md` for scope and `PHASE_0_ISSUES.md` for the issue backlog.

## How We Work

### 1. Vertical Slices — End-to-End Always

Every feature must be implemented **vertically, end-to-end**, from database through backend to frontend, fully connected and demoable.

- A feature is not "backend done" if the frontend is disconnected.
- Structure code by vertical slice (e.g. `backend/app/flats/`, `backend/app/receipts/`, `frontend/src/pages/flats.tsx`), not by horizontal layer. This gives the AI full context without jumping across the codebase.
- Example: an auth flow spans `alembic` migration + `backend/app/auth/` + Supabase JWT verification + `frontend/src/pages/login.tsx` + `frontend/src/stores/auth-store.ts` and is verified by logging in through the UI and hitting a guarded API.

If you are structuring the application, prefer co-located, slice-owned code over shared abstractions. One slice = one database concern + one API surface + one UI surface.

### 2. Test-Driven Development — Red Before Green

TDD is mandatory for every implementation and every bug fix. Always use the `/tdd` skill from the installed metapackage skills (see `skills/tdd/SKILL.md`).

- **Write the failing test first.** No production code before a red test exists — invoke `/tdd` before any implementation or bug-fix work.
- Tests live at **public seams** only: HTTP API via `TestClient` (with Supabase JWT) for backend, and user-visible component/flow tests for frontend. Do not test internals, private helpers, or mock internal collaborators.
- One slice at a time: one failing test → minimal code to green → next test. Do not write all tests up front (no horizontal slicing).
- Bug fix: reproduce with a failing test before touching source.
- See `skills/tdd/SKILL.md` for the full loop and `skills/diagnosing-bugs/SKILL.md` for the diagnosis flow.

Agree the seam with the user before the first test if it is not obvious.

## Development Commands

```bash
# backend (from backend/)
uv run dev                          # FastAPI on http://127.0.0.1:8000
uv run alembic upgrade head         # apply migrations (local DB)
uv run pytest tests/ -v             # backend tests (uses manzil_os_test, auto-migrates)

# frontend (from frontend/)
npm run dev                         # Vite on http://localhost:5173 (VITE_MOCK_API=true by default)
npm run build                       # tsc --noEmit && vite build
npm test                            # Vitest + RTL
```

- Always run the smallest meaningful tests after a slice and inspect the result.
- Always run `yarn run lint --fix` after changes and resolve linter issues before committing.
- Follow existing code style, CSS class conventions, icon usage, and component patterns; do not recreate existing utilities.

## What to Read First

- `PHASE_0_PRD.md` — product destination and acceptance criteria.
- `PHASE_0_ISSUES.md` — execution path as tracer-bullet issues. Work top-to-bottom.
- `DESIGN.md` + `NATIVE_UI_GUIDE.md` — design tokens and native app shell rules. **Every frontend change must follow `NATIVE_UI_GUIDE.md`**: MobileSelect bottom drawer (not Select), NativeDateField calendar drawer (not browser date popover), bottom native toast, and tab + scroll containment (only the panel below tabs scrolls — not the whole page).
- `CONTEXT.md` / ADRs in the area you are touching (if present) for domain language.
- `backend/README.md` and `frontend/README.md` for stack and DB workflow.

## Expectations for Every Issue

1. Restate the issue and the testing seam.
2. Proceed slice-by-slice with red → green.
3. The demo path must work on a phone viewport where applicable.
4. Any deferred work goes to a later issue, not left ambiguous.

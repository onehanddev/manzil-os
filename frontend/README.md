# Manzil OS — Frontend

Mobile-first PWA for society management (React + TypeScript + Vite).

In production this PWA is deployed at `https://app.manzilos.com` as its own
origin. The Next.js landing site links to this hostname; it is not mounted
under `/app`.

## Stack

- **React 19 + TypeScript + Vite**
- **Tailwind CSS v4 + shadcn/ui** components
- **TanStack Query** (server state) + **Zustand** (client state)
- **React Router v7** with auth guards
- **Supabase** (`supabase-js`) for authentication only — all business data
  flows through the FastAPI backend with the Supabase JWT as a bearer token
- **MSW** (Mock Service Worker) for a mock API in local dev and tests
- **PWA** via `vite-plugin-pwa` (installable, offline shell)
- **Vitest + React Testing Library** for unit/component tests
- **Cypress** for e2e tests

## Getting started

```bash
npm install
cp .env.example .env   # already points to local Supabase (http://127.0.0.1:54321)
npm run dev            # http://localhost:5173
```

The repo ships with `frontend/.env` pointing to **local Supabase** (see
`supabase/config.toml` [auth.sms.test_otp] — OTP is always `123456`, no Twilio
needed). Run `npx supabase start` then `bash scripts/sync-supabase-env.sh` to
sync keys into `.env`.

- **Demo mode:** if `VITE_SUPABASE_URL` is empty, the login screen offers
  "Continue in demo mode" (MSW mocks, no backend).
- **Local Supabase:** `VITE_SUPABASE_URL=http://127.0.0.1:54321` with the anon key
  from `npx supabase status -o env`. Use any phone in the test_otp list, e.g.
  `+919000000000` / `123456`.
- **Hosted Supabase:** copy keys from the cloud dashboard into `.env` instead.

To toggle offline mocks explicitly, set `VITE_MOCK_API=true/false` in `.env`.

## Scripts

| Script             | Purpose                                   |
| ------------------ | ----------------------------------------- |
| `npm run dev`      | Dev server (LAN-accessible for phone PWA) |
| `npm run build`    | Typecheck + production build              |
| `npm run preview`  | Preview the production build              |
| `npm test`         | Unit/component tests (Vitest + RTL)       |
| `npm run test:e2e` | Cypress e2e (needs `npm run dev` running) |
| `npm run cy:open`  | Open the Cypress runner                   |
| `npm run icons`    | Regenerate placeholder PWA icons          |

## Structure

```
src/
  app/          router, providers, guards, app shell (top bar, bottom tabs, sidebar)
  components/   shared + shadcn/ui components
  features/     (future) per-module screens: billing, receipts, expenses, ...
  lib/          api client, hooks, supabase wrapper, utils
  mocks/        MSW handlers (shared by dev worker and test server)
  pages/        route-level pages
  stores/       Zustand stores (auth session, current society)
  test/         Vitest setup, MSW server, render helpers
cypress/        e2e specs
```

## Multi-society

The app is multi-society from day one: after login, `GET /me` returns every
society the user belongs to along with per-society roles/permissions. The
society switcher in the top bar sets the "current society", which scopes all
data screens. The schema already models this via `society_memberships` +
`membership_roles`.

## Conventions

- Every API call goes through `src/lib/api/client.ts` (adds the bearer token,
  handles 401 → redirect to login).
- Server state lives in TanStack Query hooks under `src/lib/api/hooks.ts`;
  UI/transient state lives in Zustand stores.
- Type-only imports use `import type` (`verbatimModuleSyntax`).
- Money is handled in minor units or as backend-formatted strings — format for
  display with INR formatting utilities (to be added with the UX pass).

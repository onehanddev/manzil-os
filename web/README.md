# Manzil OS — Web (landing)

Next.js landing for Manzil OS. Warm paper + teal, ledger-inspired, no AI slop.

## Stack

- Next.js 15 (App Router) + React 19
- Tailwind CSS 4 (`@tailwindcss/postcss`)
- Fonts: Geist (sans) + Instrument Serif (display) via `next/font`

## Run

```bash
npm install
cp .env.example .env   # set NEXT_PUBLIC_APP_URL
npm run dev            # http://localhost:3000
npm run build
```

## Config

- `NEXT_PUBLIC_APP_URL` — where "Open app" links to. Defaults to `http://localhost:5173` (frontend Vite dev server). Point to your deployed PWA in production.

## Structure

- `src/app/page.tsx` — single-page landing (nav + hero ledger + proof strip + how it works + desk + scope + CTA)
- `src/app/globals.css` — Tailwind + paper tokens (`#F7F5EF` / `#176B63` / `#17201E`)
- `src/app/layout.tsx` — fonts + metadata

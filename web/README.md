# Manzil OS — Web (landing)

Next.js landing for Manzil OS. Warm paper + teal, ledger-inspired, no AI slop.
The landing site is deployed on the root domain; the PWA is deployed separately on `app.manzilos.com`.

## Stack

- Next.js 15 (App Router) + React 19
- Tailwind CSS 4 (`@tailwindcss/postcss`)
- Fonts: Geist (sans) + Instrument Serif (display) via `next/font`

## Run

```bash
npm install
cp .env.example .env   # set NEXT_APP_URL to the PWA origin
npm run dev            # http://localhost:3000
npm run build
```

## Config

- `NEXT_APP_URL` — the PWA origin used by every "Open app" link. Defaults to `http://localhost:5173` locally; use `https://app.manzilos.com` in production. Do not add `/app`.

## Structure

- `src/app/page.tsx` — single-page landing (nav + hero ledger + proof strip + how it works + desk + scope + CTA)
- `src/app/globals.css` — Tailwind + paper tokens (`#F7F5EF` / `#176B63` / `#17201E`)
- `src/app/layout.tsx` — fonts + metadata

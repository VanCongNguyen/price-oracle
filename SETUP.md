# Setup & Customization Guide

Thanks for purchasing this source code! This guide covers installing,
running, and rebranding the app — no coding required for basic setup.

## What this is

A price-prediction dashboard for BTC, ETH, UNI, and gold. It fetches
price history from free public APIs, trains three ML models per asset
(Linear Regression, Random Forest, LSTM), and serves predictions through
a web dashboard.

**Important:** the predictions are informational only, not financial
advice — see the disclaimer already built into the app, and `LICENSE.md`
for the terms you're using this code under.

## 1. Prerequisites

Install [Docker Desktop](https://www.docker.com/products/docker-desktop)
(or Docker Engine + the `docker compose` plugin on Linux). That's the
only requirement — Docker builds everything else for you.

## 2. Run it

From the project root:

```bash
docker compose up --build
```

This starts the backend on `http://localhost:8000` and the frontend on
`http://localhost:3000`. Open the frontend, click **"Fetch data & train
models"** once (takes a few minutes the first time), and the dashboard
will populate.

## 3. Rebrand it

Copy `.env.example` to `.env` in the project root and set:

```bash
APP_NAME=Your Product Name
```

Restart with `docker compose up` and both the page header/browser tab
and the API title pick up the new name automatically — no code changes
needed.

To change the favicon, replace `frontend/app/favicon.ico` with your own
`.ico` file of the same name.

To change colors or layout, edit `frontend/app/page.tsx` (Chakra UI
components) — see `CLAUDE.md` for a map of the codebase if you or your
developer need to go deeper.

## 4. Optional: more accurate gold data

The gold chart uses free Yahoo Finance data by default (no setup
needed). If you want an additional live gold-price cross-check, sign up
for a free key at [goldapi.io](https://www.goldapi.io/dashboard) (capped
around 100 requests/month) and put it in `backend/.env`:

```bash
GOLDAPI_KEY=your-key-here
```

Copy `backend/.env.example` to `backend/.env` first if that file doesn't
exist yet. Without a key, everything else in the app still works — only
the "Update gold price history (GoldAPI)" button is affected.

## 5. Deploying for real users

`docker compose up` is meant for local use/evaluation. To put this in
front of real customers:

- Put the frontend and backend behind a reverse proxy (e.g. nginx,
  Caddy, or a platform like Fly.io/Render) with HTTPS.
- Set `NEXT_PUBLIC_API_BASE` (in the root `.env`) to the backend's public
  URL.
- Set `ALLOWED_ORIGINS` in `backend/.env` to your actual frontend
  domain(s) (comma-separated). It defaults to `*` (any origin), which is
  fine for local dev but should be restricted before going live.
- Decide how often to refresh data automatically (e.g. a scheduled job
  calling `POST /data/refresh`) instead of relying on someone clicking
  the button.

## 6. Language

The UI ships with Vietnamese and English, switchable in the top-right
corner. All UI text lives in `frontend/app/translations.ts` if you want
to edit wording or add another language.

## Support

This is a one-time source code purchase — see `LICENSE.md` for what's
included. Support/customization beyond the license terms would need to
be arranged separately with the seller.

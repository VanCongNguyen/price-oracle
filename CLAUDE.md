# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Price Oracle is a two-part app that predicts BTC/ETH/gold prices with ML:

- `backend/` — FastAPI service (Python) that fetches price history, engineers features, trains baseline + LSTM models, and serves history/prediction endpoints.
- `frontend/` — Next.js (App Router) + Chakra UI + Recharts client that calls the backend and charts actual vs. predicted prices.

There is no monorepo tooling tying the two together — run each independently.

This codebase is sold as white-label source code (see `LICENSE.md`) — `SETUP.md` is the buyer-facing install/rebrand guide (no-code), separate from this file (which is for AI agents/developers working on the code itself). Keep buyer-facing instructions in `SETUP.md` in sync with any change to env vars or setup steps described below.

## Commands

### Backend (from `backend/`)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt        # torch install is large; see the CPU-only note in requirements.txt

# 1. Fetch raw price history into backend/data/*.csv (gitignored, must run before anything else)
python -m app.data.fetch_crypto         # btc, eth, uni -> Binance
python -m app.data.fetch_gold           # gold -> yfinance

# 2. Train models into backend/app/models/artifacts/ (gitignored)
python -m app.models.train_baseline     # linear + random_forest, per symbol
python -m app.models.train_lstm         # lstm, per symbol

# 3. Run the API (default http://127.0.0.1:8000)
uvicorn app.main:app --reload
```

There are no tests or linters configured for the backend currently.

Branding/deploy env vars (all optional, all read via `os.environ` with defaults — no code changes needed): `APP_NAME` (API title, defaults to "Price Oracle"), `ALLOWED_ORIGINS` (comma-separated CORS origins, defaults to `*`). The frontend has matching `NEXT_PUBLIC_APP_NAME`/`NEXT_PUBLIC_API_BASE`. A root-level `.env` (see `.env.example`) is read automatically by `docker compose` and fans `APP_NAME`/`NEXT_PUBLIC_API_BASE` out to both services via `docker-compose.yml`'s `${VAR:-default}` substitutions — that's the one buyers are pointed to in `SETUP.md` for rebranding.

Optional `backend/.env` (gitignored, loaded via `python-dotenv`): `GOLDAPI_KEY=...` enables `POST /data/refresh-gold-price?days=365` (query param, 1-3650, default 365), which backfills that many days of gold prices from [goldapi.io](https://www.goldapi.io)'s `/api/history/XAU/USD` (chunked into ≤85-day requests — the API hard-caps ranges at 90 days, so request count scales with `days`) plus the current spot price from `/api/price/XAU/USD`, into `backend/data/gold_goldapi.csv` — a separate file from the primary `gold_yahoo_finance.csv`, kept apart because it isn't read by the loader/training pipeline (reference/comparison only) and the free GoldAPI tier is capped around 100 requests/month (check usage at `/api/stat`). Without the key, that one endpoint 502s but everything else works normally. GoldAPI also has its own `/api/rates` currency endpoint, but the app deliberately uses `fetch_fx.py`'s free, unlimited `open.er-api.com` for USD/VND instead, to avoid spending GoldAPI's scarce quota on something unrelated to gold prices.

### Docker (when the host Python isn't usable, e.g. only Python 2.7 is installed)

```bash
docker compose up --build          # starts backend on :8000 and frontend on :3000

# One-off, only needed once (backend/data and backend/app/models/artifacts
# are bind-mounted, so fetched CSVs / trained models persist across restarts):
docker compose run --rm backend python -m app.data.fetch_crypto
docker compose run --rm backend python -m app.data.fetch_gold
docker compose run --rm backend python -m app.models.train_baseline
docker compose run --rm backend python -m app.models.train_lstm
```

Both services bind-mount their source (`backend/app`, `frontend/`) for hot reload, so no rebuild is needed after editing code — only after changing `requirements.txt` or `package.json`. `backend/.env` is passed through via `env_file: required: false` on the backend service, so it works if present and is silently skipped if not.

Instead of the one-off commands above, the running app also exposes `POST /data/fetch-crypto` (Binance primary source), `POST /data/fetch-gold` (yfinance primary source), and `POST /data/train` (retrain everything using whatever's already fetched) as separate steps, plus three secondary-source endpoints — `POST /data/refresh-gold-price` (GoldAPI), `POST /data/refresh-crypto-coingecko`, `POST /data/refresh-crypto-yahoo` — that the frontend's buttons call (see Architecture below).

### Frontend (from `frontend/`)

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
npm run lint
```

Set `NEXT_PUBLIC_API_BASE` (defaults to `http://127.0.0.1:8000`) if the backend runs elsewhere.

## Architecture

**Data pipeline (backend/app/data/):** every fetch script writes to `backend/data/<YYYY-MM-DD>_<symbol>_<source>.csv` — no fixed/undated filename exists at all. Note the path: `DATA_DIR` in these scripts and in `loader.py` resolves to `backend/data/`, which is a sibling of `backend/app/`, *not* `backend/app/data/` (that's just where the loader/fetch code itself lives).

Every save function writes through `archive.save_dated_csv(df, base_path)` instead of `df.to_csv()` directly: `base_path`'s name (e.g. `btc_binance.csv`) is just used to derive that day's snapshot filename, it's never written as-is. This matters because every fetch pulls a rolling window (e.g. "last 365 days"); dating each fetch as its own file means a later fetch never silently discards a day that aged out of that window. Reading it back is symmetric: `archive.latest_dated_csv(dir_path, suffix)` globs `*_<suffix>` and returns the lexicographically-last match (dates sort correctly as strings) — `loader.load_raw()` uses this instead of opening a fixed path, so it's always reading whatever the most recent fetch produced.

Each symbol has one **primary** source, read by `loader.load_prices(symbol)` via `PRIMARY_FILE_SUFFIXES` and used for training/prediction — this is the only data the pipeline actually depends on:
- `fetch_crypto.py` (Binance `/api/v3/klines`, no API key) → `btc_binance.csv`, `eth_binance.csv`, `uni_binance.csv`.
- `fetch_gold.py`'s `save_gold_history()` (yfinance `GC=F` futures) → `gold_yahoo_finance.csv`.

Every symbol also has one or more **secondary** sources, each in its own file that the loader never reads (reference/comparison only, not part of training) — fetched by a dedicated endpoint/script so refreshing them never touches the primary data or triggers retraining:
- `fetch_gold.py`'s `save_goldapi_history()` backfills `gold_goldapi.csv` from GoldAPI (see quota note above).
- `fetch_crypto_coingecko.py` → `<symbol>_coingecko.csv` (BTC/ETH/UNI via CoinGecko).
- `fetch_crypto_yahoo.py` → `<symbol>_yahoo_finance.csv` (BTC/ETH/UNI via yfinance; UNI uses the `UNI7083-USD` ticker — Yahoo's plain `UNI-USD`/`UNI1-USD` tickers exist but stopped updating years ago).
- `fetch_fx.py`'s `save_usd_vnd_rate()` fetches the USD→VND rate from `open.er-api.com` (free, no key) into `usd_vnd_exchangerate.csv` — used only for the frontend's gold currency toggle, not a symbol/loader concept at all.

**Feature engineering (backend/app/preprocessing.py):** `clean_prices` reindexes to a continuous daily series (forward-filling gaps like weekends/holidays), which both the baseline models and the LSTM depend on. `add_features`/`build_dataset` add lag and rolling-window features (`FEATURE_COLUMNS`) for the baseline models only; the LSTM instead consumes the raw cleaned price series windowed into sequences (`SEQ_LEN` in `models/lstm_model.py`).

**Models (backend/app/models/):** `train_baseline.py` fits Linear Regression and Random Forest on the engineered features and saves `.joblib` artifacts. `train_lstm.py` fits `PriceLSTM` (`lstm_model.py`) on scaled sequences and saves a `.pt` state dict plus the fitted `MinMaxScaler`. All artifacts land in `backend/app/models/artifacts/` (gitignored — must be regenerated locally by running the training scripts, they are not checked in).

**Inference (backend/app/models/predict.py):** `forecast(symbol, model_name, horizon)` does iterative multi-step forecasting: it predicts one day at a time and feeds each prediction back in as history for the next step (via `_build_feature_row` for baseline models, or by appending to the scaled window for the LSTM). Baseline and LSTM inference are separate code paths (`_forecast_baseline` vs `_forecast_lstm`) that both load the same underlying cleaned history from `loader.load_prices`.

**API (backend/app/main.py):** `GET /history/{symbol}` and `GET /predict/{symbol}` (query params `model`, `horizon`) validate the symbol/model against `SYMBOLS`/`MODEL_NAMES` and translate missing-artifact `FileNotFoundError`s into a `503`. `POST /data/fetch-crypto` and `POST /data/fetch-gold` re-fetch each symbol's **primary** source (no training) — split by source so fetching one doesn't wait on or depend on the other; `POST /data/train` retrains all models from whatever's currently on disk (no fetching) — separate from fetching so you can e.g. pull fresh data without paying the LSTM training cost, or retrain without re-hitting the price APIs. `POST /data/refresh-gold-price`, `POST /data/refresh-crypto-coingecko`, `POST /data/refresh-crypto-yahoo`, and `POST /data/refresh-fx-rate` each run one secondary/reference fetch described above and return the fetched values in the response (`latest`) — none of them touch the primary CSVs or trigger retraining. All five fetch/refresh endpoints (`fetch-crypto`, `fetch-gold`, `refresh-gold-price`, `refresh-crypto-coingecko`, `refresh-crypto-yahoo`) take the same `days` query param; the frontend exposes it as one shared "History range to fetch" dropdown (`translations.ts`'s `HISTORY_RANGE_OPTIONS`) rather than a separate control per button — `goldApiRequestsForDays()` derives the GoldAPI-specific request-count hint from whatever range is currently selected. CORS origins come from `ALLOWED_ORIGINS` (default `*`, fine for local dev but should be restricted in production — see `SETUP.md`).

**Frontend (frontend/app/):** `page.tsx` is the only real screen — it lets the user pick symbol/model/horizon, fetches `/history` and `/predict` in parallel, and stitches them into one series (bridging the last actual point into the prediction line) for `components/PriceChart.tsx` (Recharts). It also has buttons wired to the secondary-source refresh endpoints above: the gold one only shows when `symbol === "gold"`, the CoinGecko/Yahoo Finance ones only when it isn't. `providers.tsx` wires up Chakra UI's `ChakraProvider` in `layout.tsx`. `translations.ts` holds all VI/EN UI copy (`TEXT`, `SYMBOLS`, `MODELS`, `MODEL_NOTES`) keyed by `Lang`; the page's language toggle reads/writes `localStorage["lang"]` and falls back to `"vi"`. Gold prices are always served/stored in USD per troy ounce; `translations.ts`'s `GOLD_UNITS` (oz/gram/chỉ/lượng — 1 lượng = 10 chỉ = 37.5g) provides client-side-only weight conversion factors, and a separate USD/VND toggle (backed by `POST /data/refresh-fx-rate`) multiplies in a currency factor on top — both combine into one `unitFactor` applied to the chart, stat cards, and GoldAPI result whenever `symbol === "gold"`. None of this touches the backend or CSVs; it's purely a display-time multiplication in `page.tsx`.

## Conventions

- Backend docstrings/comments are written in English (matches the white-label/commercial packaging — see `LICENSE.md`/`SETUP.md`); match that when touching `backend/` code.
- Frontend UI copy lives in `translations.ts` (VI + EN), not hardcoded in components; add new UI strings there for both languages.
- Symbols are always one of `btc`, `eth`, `uni`, `gold`; model names are always one of `linear`, `random_forest`, `lstm` — both are enumerated as constants (`SYMBOLS` in `loader.py`, `MODEL_NAMES` in `predict.py`) rather than duplicated as literals.
- Every `backend/data/*.csv` file is named `<YYYY-MM-DD>_<symbol>_<source>.csv` (e.g. `2026-09-14_btc_binance.csv`) — never add a fetch script that writes a fixed/undated filename. Which file *suffix* is primary (used by training/prediction) vs. secondary (reference-only) is defined by `loader.PRIMARY_FILE_SUFFIXES`, not by naming convention alone.
- Any new fetch script must save through `archive.save_dated_csv()` and read back via `archive.latest_dated_csv()` (see above), not `df.to_csv()`/a fixed path directly, so its data isn't silently lost when the next fetch's rolling window shifts past it.

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

# 1. Fetch raw price history into backend/data/*.csv (checked into git so a
#    fresh clone already has data to train on; re-run this to refresh it)
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

Instead of the one-off commands above, the running app also exposes `POST /data/fetch-crypto` (Binance primary source), `POST /data/fetch-gold` (yfinance primary source), and `POST /data/train` (retrain everything using whatever's already fetched) as separate steps, plus three secondary-source endpoints — `POST /data/refresh-gold-price` (GoldAPI), `POST /data/refresh-crypto-coingecko`, `POST /data/refresh-crypto-yahoo` — that the frontend's `/admin` page's buttons call (see Architecture below).

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

`backend/data/*.csv` is checked into git (a deliberate choice — a fresh clone comes with data to train on immediately), unlike `backend/app/models/artifacts/` which stays gitignored. Since fetches never overwrite, only add, this means the repo grows a little with every fetch that runs — accepted as a tradeoff for not requiring a fetch step before the app is usable. `backend/data/*.db` is still gitignored (unused currently, kept in case one shows up locally).

Every save function writes through `archive.save_dated_csv(df, base_path)` instead of `df.to_csv()` directly: `base_path`'s name (e.g. `btc_binance.csv`) is just used to derive that day's snapshot filename, it's never written as-is. This matters because every fetch pulls a rolling window (e.g. "last 365 days"); dating each fetch as its own file means a later fetch never silently discards a day that aged out of that window. Reading it back is symmetric: `archive.latest_dated_csv(dir_path, suffix)` globs `*_<suffix>` and returns the lexicographically-last match (dates sort correctly as strings) — `loader.load_raw()` uses this instead of opening a fixed path, so it's always reading whatever the most recent fetch produced.

Each symbol has one **primary** source, read by `loader.load_prices(symbol)` via `PRIMARY_FILE_SUFFIXES` and used for training/prediction — this is the only data the pipeline actually depends on:
- `fetch_crypto.py` (Binance `/api/v3/klines`, no API key) → `btc_binance.csv`, `eth_binance.csv`, `uni_binance.csv`.
- `fetch_gold.py`'s `save_gold_history()` (yfinance `GC=F` futures) → `gold_yahoo_finance.csv`.

Every symbol also has one or more **secondary** sources, each in its own file that the loader never reads (reference/comparison only, not part of training) — fetched by a dedicated endpoint/script so refreshing them never touches the primary data or triggers retraining:
- `fetch_gold.py`'s `save_goldapi_history()` backfills `gold_goldapi.csv` from GoldAPI (see quota note above).
- `fetch_crypto_coingecko.py` → `<symbol>_coingecko.csv` (BTC/ETH/UNI via CoinGecko). CoinGecko's free/public API 401s on any request older than 365 days ("Public API users are limited to querying historical data within the past 365 days"), so `fetch_coin_history` clamps `days` to `COINGECKO_MAX_DAYS` (365) rather than passing the shared fetch-range value straight through — the frontend's CoinGecko note says so, since the shared "History range to fetch" dropdown can go up to 5 years and this source silently can't follow past a year.
- `fetch_crypto_yahoo.py` → `<symbol>_yahoo_finance.csv` (BTC/ETH/UNI via yfinance; UNI uses the `UNI7083-USD` ticker — Yahoo's plain `UNI-USD`/`UNI1-USD` tickers exist but stopped updating years ago).
- `fetch_fx.py`'s `save_usd_vnd_rate()` fetches the USD→VND rate from `open.er-api.com` (free, no key) into `usd_vnd_exchangerate.csv` — used only for the frontend's gold currency toggle, not a symbol/loader concept at all.

**Feature engineering (backend/app/preprocessing.py):** `clean_prices` reindexes to a continuous daily series (forward-filling gaps like weekends/holidays), which both the baseline models and the LSTM depend on. `add_features` adds lag/rolling-window features plus technical indicators (`rsi_14`, `macd_hist`, `volatility_14`, `volume_rel_7`) — all in `FEATURE_COLUMNS`, for the baseline models only; the LSTM instead consumes the raw cleaned price series windowed into sequences (`SEQ_LEN` in `models/lstm_model.py`). The existing `lag_*`/`rolling_*`/`pct_change_1` columns use `shift(1)` (exclude the anchor day's own price); the technical indicators don't, and that's intentional, not a leakage bug — see the note below.

**Direct multi-horizon prediction, not iterative:** every model predicts the *entire* requested horizon in one call from real, known history, instead of predicting one day and feeding that prediction back in as input for the next step (which used to compound error the further out the forecast went). `preprocessing.build_horizon_dataset(raw_df)` builds the baseline (Linear/RF) training set: one row per `(anchor day, horizon)` pair for `horizon` in `1..MAX_HORIZON` (30), with `target_return = (price[t+h] - price[t]) / price[t]` and `horizon` itself included as an input feature — this is also why the technical indicators above can safely use the anchor day's own price: the target is the *future* price relative to the anchor, not the anchor day's own price, so nothing about day `t` is being leaked into its own features. `PriceLSTM`'s output head predicts all `MAX_HORIZON` days directly (`Linear(hidden_size, MAX_HORIZON)` in `lstm_model.py`) from one forward pass over the last `SEQ_LEN` days, instead of one value fed back in step by step.

**Models (backend/app/models/):** `train_baseline.py` fits Linear Regression and Random Forest on `build_horizon_dataset`'s output (split by anchor *date*, not row count, since rows are now date×horizon) and saves `.joblib` artifacts; Random Forest's `max_depth` is picked via a small `TimeSeriesSplit` cross-validation grid search (`RF_MAX_DEPTH_GRID`) before the final fit. `train_lstm.py` fits `PriceLSTM` on scaled sequences, comparing two `hidden_size` candidates (`HIDDEN_SIZE_GRID`) against the held-out validation split and keeping whichever tests better — the winning size is saved to `<symbol>_lstm_config.json` since inference needs it to reconstruct the same architecture before loading the `.pt` state dict. Both scripts write per-symbol metrics (`baseline_metrics.json`, `lstm_metrics.json`) including the chosen hyperparameter. All artifacts land in `backend/app/models/artifacts/` (gitignored — must be regenerated locally by running the training scripts, they are not checked in). Because the feature set and the LSTM's output shape changed, artifacts trained before this change are incompatible — re-run training (`POST /data/train`) rather than trying to reuse old ones.

**Ensemble (backend/app/models/ensemble.py):** `compute_weights()` runs after both trainers finish (wired into `POST /data/train`) and reads their metrics JSON to compute, per symbol, inverse-test-MAPE weights across `linear`/`random_forest`/`lstm`, saved to `ensemble_weights.json`. `"ensemble"` is a fourth entry in `predict.MODEL_NAMES`; forecasting it just calls the other three models' forecast functions and blends their per-day prices with the saved weights — no separate model is trained for it.

**Inference (backend/app/models/predict.py):** `forecast(symbol, model_name, horizon)` routes to `_forecast_baseline`, `_forecast_lstm`, or `_forecast_ensemble`. `_forecast_baseline` reuses `preprocessing.add_features` directly (rather than a separate hand-rolled feature builder) so training and inference can never compute features differently — that mismatch was the root cause of an earlier prediction-leakage bug, so this stayed a deliberate design constraint, not just a convenience. It takes the last row of the featured history as the anchor and builds one batched request (one row per `horizon` value) for a single `model.predict()` call.

**Prediction logging (backend/app/data/prediction_log.py):** every `GET /predict/{symbol}` call also appends its forecast to `predictions_log.csv` (`log_prediction`) — one row per `(logged_date, symbol, model, target_date)`, deduplicated on that key so calling `/predict` repeatedly the same day (e.g. every page load) never creates duplicate rows, but a later same-day call with a longer horizon still adds the new dates. There's no scheduler in this app, so this piggybacks on real traffic instead: a date only gets logged if someone actually viewed that symbol/model that day. Logging failures are caught and printed, never surfaced to the caller — a disk issue here shouldn't stop someone from getting their forecast. `GET /predict-history/{symbol}` (optional `model` filter) calls `compare_with_actual()`, which inner-joins the log against `loader.load_prices(symbol)` on `target_date`, so it only ever returns rows whose target date has already happened — this is what lets `/`'s "Prediction history vs. actual" table show genuinely live, out-of-sample accuracy instead of only the backtest metrics computed at training time.

**API (backend/app/main.py):** `GET /history/{symbol}` and `GET /predict/{symbol}` (query params `model`, `horizon`) validate the symbol/model against `SYMBOLS`/`MODEL_NAMES` and translate missing-artifact `FileNotFoundError`s into a `503`; `/predict` also best-effort logs its forecast via `prediction_log.log_prediction` (see below). `GET /predict-history/{symbol}` (optional `model` query param) returns that log joined against actual prices, for whichever target dates have already happened. `POST /data/fetch-crypto` and `POST /data/fetch-gold` re-fetch each symbol's **primary** source (no training) — split by source so fetching one doesn't wait on or depend on the other; `POST /data/train` retrains all models from whatever's currently on disk (no fetching) — separate from fetching so you can e.g. pull fresh data without paying the LSTM training cost, or retrain without re-hitting the price APIs. `POST /data/refresh-gold-price`, `POST /data/refresh-crypto-coingecko`, `POST /data/refresh-crypto-yahoo`, and `POST /data/refresh-fx-rate` each run one secondary/reference fetch described above and return the fetched values in the response (`latest`) — none of them touch the primary CSVs or trigger retraining. All five fetch/refresh endpoints (`fetch-crypto`, `fetch-gold`, `refresh-gold-price`, `refresh-crypto-coingecko`, `refresh-crypto-yahoo`) take the same `days` query param; the frontend exposes it as one shared "History range to fetch" dropdown (`translations.ts`'s `HISTORY_RANGE_OPTIONS`) rather than a separate control per button — `goldApiRequestsForDays()` derives the GoldAPI-specific request-count hint from whatever range is currently selected. CORS origins come from `ALLOWED_ORIGINS` (default `*`, fine for local dev but should be restricted in production — see `SETUP.md`).

All endpoints are rate-limited via `slowapi` (`Limiter` set up in `main.py`, backed by the `limits` library's default in-memory store). `/history`, `/predict`, and `/predict-history` are limited per caller IP (`get_remote_address`), since only the caller who spams them is affected. Every `/data/*` endpoint uses a shared `_global_key` instead — these are unauthenticated, site-wide buttons that spend a resource shared by every visitor combined (one GoldAPI monthly quota, one training job, one set of on-disk CSVs), so a per-IP limit alone wouldn't stop many different visitors from exhausting that shared resource together. `refresh-gold-price` gets the tightest limit (`3/day`) because GoldAPI's free tier is capped around 100 requests/month and one call already spends several requests (see `GOLDAPI_MAX_RANGE_DAYS` chunking above); `train` is next-tightest (`2/hour`) since LSTM training is CPU-heavy. Rate limiting reduces accidental/casual abuse but is not authentication — there's still no login/API-key check on `/data/*`, so anyone can still call them within the limits; add an API-key check in `main.py` or put those routes behind an auth proxy if stronger access control is needed.

**Frontend (frontend/app/):** three screens, split by audience rather than by feature area:

- `page.tsx` (`/`) is the public client dashboard — pick symbol/model/horizon, view stats + the actual-vs-predicted chart, and adjust display-only options (gold unit, USD/VND, how much history the chart shows). It has no fetch/train buttons at all. It fetches `/history` and `/predict` in parallel and stitches them into one series (bridging the last actual point into the prediction line) for `components/PriceChart.tsx` (Recharts). Below that, a "Prediction history vs. actual" table (fetched from `/predict-history/{symbol}?model=...`, refetched whenever `symbol` or `model` changes) shows past forecasts against what actually happened — the only place in the app that surfaces real, out-of-sample accuracy rather than backtest metrics.
- `admin/page.tsx` (`/admin`) is the data-management screen — every fetch/train/refresh button lives here instead (`fetch-crypto`/`fetch-gold`, the GoldAPI/CoinGecko/Yahoo reference refreshes, `train`). It's intentionally **not linked from `/`** (visited by typing the URL) since these are unauthenticated, resource-spending actions a random public visitor shouldn't be invited to click — see the rate-limiting note above. Its own Asset picker only offers Gold vs. Crypto (`translations.ts`'s `fetchAssetOptions()`), not one option per coin, because the crypto fetch and reference refreshes always operate on every crypto symbol at once (`fetch_crypto.TRADING_PAIRS`) — there's no per-coin fetch to pick between. The CoinGecko/Yahoo reference results likewise show every coin's price at once (`Record<string, {date, price}>` keyed by symbol) instead of filtering to a single selected one.
- `how-it-works/page.tsx` (`/how-it-works`) is a static explainer for public visitors — data sources, how prediction/ensemble/direct-multi-horizon works, accuracy caveats — content lives in `translations.ts`'s `HOW_IT_WORKS`. Linked from `/`'s header (unlike `/admin`, this one *should* be discoverable, since it exists to build trust with visitors, not to gate risky actions).

All three read/write the same `localStorage["lang"]` key independently (no shared state across pages beyond that), each with its own small VI/EN `<NativeSelect>` in the header. `providers.tsx` wires up Chakra UI's `ChakraProvider` in `layout.tsx`. `translations.ts` holds all VI/EN UI copy (`TEXT`, `SYMBOLS`, `MODELS`, `MODEL_NOTES`, `HOW_IT_WORKS`) keyed by `Lang`, including a `disclaimer` string rendered as a banner right under `/`'s header — a "not financial advice" risk warning, required since this app predicts real-money asset prices and is meant to be public. Gold prices are always served/stored in USD per troy ounce; `translations.ts`'s `GOLD_UNITS` (oz/gram/chỉ/lượng — 1 lượng = 10 chỉ = 37.5g) provides client-side-only weight conversion factors, and a separate USD/VND toggle (backed by `POST /data/refresh-fx-rate`) multiplies in a currency factor on top — both combine into one `unitFactor` applied to the chart and stat cards on `/`, and to the GoldAPI result on `/admin`, whenever gold is selected. None of this touches the backend or CSVs; it's purely a display-time multiplication.

## Conventions

- Backend docstrings/comments are written in English (matches the white-label/commercial packaging — see `LICENSE.md`/`SETUP.md`); match that when touching `backend/` code.
- Frontend UI copy lives in `translations.ts` (VI + EN), not hardcoded in components; add new UI strings there for both languages.
- Symbols are always one of `btc`, `eth`, `uni`, `gold`; model names are always one of `linear`, `random_forest`, `lstm` — both are enumerated as constants (`SYMBOLS` in `loader.py`, `MODEL_NAMES` in `predict.py`) rather than duplicated as literals.
- Every `backend/data/*.csv` file **fetched from an external source** is named `<YYYY-MM-DD>_<symbol>_<source>.csv` (e.g. `2026-09-14_btc_binance.csv`) — never add a fetch script that writes a fixed/undated filename. Which file *suffix* is primary (used by training/prediction) vs. secondary (reference-only) is defined by `loader.PRIMARY_FILE_SUFFIXES`, not by naming convention alone. The one deliberate exception is `predictions_log.csv` (`prediction_log.py`): it's the app's own output, not a re-fetched external snapshot, so it's a single continuously-growing, deduplicated-on-append file rather than a dated one — dating it would break the append/dedup logic that keeps it from growing unbounded.
- Any new fetch script must save through `archive.save_dated_csv()` and read back via `archive.latest_dated_csv()` (see above), not `df.to_csv()`/a fixed path directly, so its data isn't silently lost when the next fetch's rolling window shifts past it.

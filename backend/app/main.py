"""FastAPI app exposing price history and prediction endpoints."""

import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.data import fetch_crypto, fetch_crypto_coingecko, fetch_crypto_yahoo, fetch_fx, fetch_gold, prediction_log
from app.data.loader import SYMBOLS, load_prices
from app.models import ensemble, train_baseline, train_lstm
from app.models.predict import MODEL_NAMES, forecast
from app.preprocessing import MAX_HORIZON

load_dotenv()

app = FastAPI(title=os.environ.get("APP_NAME", "Price Oracle") + " API")

_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _allowed_origins == "*" else _allowed_origins.split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Read endpoints (/history, /predict) are limited per caller IP.
# Fetch/train/refresh endpoints share resources across every visitor
# (a single GoldAPI quota, one training job, one set of CSV files on disk),
# so they're limited with a shared "global" key instead of per-IP: an
# unauthenticated site-wide button has to protect the shared quota/compute
# from the sum of all visitors, not just throttle each visitor individually.
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter


def _global_key(request: Request) -> str:
    return "global"


@app.exception_handler(RateLimitExceeded)
def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(status_code=429, content={"detail": f"Rate limit exceeded: {exc.detail}"})


def _validate_symbol(symbol: str) -> str:
    symbol = symbol.lower()
    if symbol not in SYMBOLS:
        raise HTTPException(status_code=404, detail=f"Unknown symbol '{symbol}'. Use one of {SYMBOLS}.")
    return symbol


def _validate_model(model: str) -> str:
    model = model.lower()
    if model not in MODEL_NAMES:
        raise HTTPException(status_code=400, detail=f"Unknown model '{model}'. Use one of {MODEL_NAMES}.")
    return model


def _validate_days(days: int) -> int:
    if not 1 <= days <= 3650:
        raise HTTPException(status_code=400, detail="days must be between 1 and 3650")
    return days


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/history/{symbol}")
@limiter.limit("30/minute")
def history(request: Request, symbol: str, days: int = 90):
    symbol = _validate_symbol(symbol)
    try:
        df = load_prices(symbol).tail(days)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {
        "symbol": symbol,
        "history": [
            {"date": row.date.strftime("%Y-%m-%d"), "price": row.price}
            for row in df.itertuples()
        ],
    }


@app.get("/predict/{symbol}")
@limiter.limit("20/minute")
def predict(request: Request, symbol: str, model: str = "random_forest", horizon: int = 7):
    symbol = _validate_symbol(symbol)
    model = _validate_model(model)
    if not 1 <= horizon <= MAX_HORIZON:
        raise HTTPException(status_code=400, detail=f"horizon must be between 1 and {MAX_HORIZON}")

    try:
        predictions = forecast(symbol, model_name=model, horizon=horizon)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    try:
        prediction_log.log_prediction(symbol, model, predictions)
    except Exception as exc:
        # Logging is best-effort: a disk/permissions issue here shouldn't
        # stop the caller from getting their forecast.
        print(f"Warning: failed to log prediction for {symbol}/{model}: {exc}")

    return {"symbol": symbol, "model": model, "horizon": horizon, "predictions": predictions}


@app.get("/predict-history/{symbol}")
@limiter.limit("30/minute")
def predict_history(request: Request, symbol: str, model: str | None = None):
    symbol = _validate_symbol(symbol)
    if model is not None:
        model = _validate_model(model)

    try:
        comparisons = prediction_log.compare_with_actual(symbol, model)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {"symbol": symbol, "model": model, "comparisons": comparisons}


@app.post("/data/fetch-crypto")
@limiter.limit("10/hour", key_func=_global_key)
def fetch_crypto_data(request: Request, days: int = 365):
    days = _validate_days(days)
    try:
        for symbol in fetch_crypto.TRADING_PAIRS:
            fetch_crypto.save_coin_history(symbol, days=days)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Crypto data fetch failed: {exc}") from exc
    return {"status": "ok"}


@app.post("/data/fetch-gold")
@limiter.limit("10/hour", key_func=_global_key)
def fetch_gold_data(request: Request, days: int = 365):
    days = _validate_days(days)
    try:
        fetch_gold.save_gold_history(days=days)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gold data fetch failed: {exc}") from exc
    return {"status": "ok"}


@app.post("/data/train")
@limiter.limit("2/hour", key_func=_global_key)
def train_models(request: Request):
    try:
        train_baseline.main()
        train_lstm.main()
        ensemble.compute_weights()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Training failed: {exc}") from exc
    return {"status": "ok"}


@app.post("/data/refresh-gold-price")
@limiter.limit("3/day", key_func=_global_key)
def refresh_gold_price(request: Request, days: int = 365):
    days = _validate_days(days)
    try:
        result = fetch_gold.save_goldapi_history(days=days)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"GoldAPI refresh failed: {exc}") from exc
    return {"status": "ok", **result}


@app.post("/data/refresh-crypto-coingecko")
@limiter.limit("10/hour", key_func=_global_key)
def refresh_crypto_coingecko(request: Request, days: int = 365):
    days = _validate_days(days)
    try:
        latest = {}
        for symbol in fetch_crypto_coingecko.COIN_IDS:
            df = fetch_crypto_coingecko.save_coin_history(symbol, days=days)
            last = df.iloc[-1]
            latest[symbol] = {"date": str(last["date"]), "price": float(last["price"])}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"CoinGecko refresh failed: {exc}") from exc
    return {"status": "ok", "latest": latest}


@app.post("/data/refresh-crypto-yahoo")
@limiter.limit("10/hour", key_func=_global_key)
def refresh_crypto_yahoo(request: Request, days: int = 365):
    days = _validate_days(days)
    try:
        latest = {}
        for symbol in fetch_crypto_yahoo.YAHOO_TICKERS:
            df = fetch_crypto_yahoo.save_coin_history(symbol, days=days)
            last = df.iloc[-1]
            latest[symbol] = {"date": str(last["date"]), "price": float(last["price"])}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Yahoo Finance refresh failed: {exc}") from exc
    return {"status": "ok", "latest": latest}


@app.post("/data/refresh-fx-rate")
@limiter.limit("20/hour", key_func=_global_key)
def refresh_fx_rate(request: Request):
    try:
        latest = fetch_fx.save_usd_vnd_rate()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"FX rate refresh failed: {exc}") from exc
    return {"status": "ok", "latest": latest}

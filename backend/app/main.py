"""FastAPI app exposing price history and prediction endpoints."""

import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.data import fetch_crypto, fetch_crypto_coingecko, fetch_crypto_yahoo, fetch_fx, fetch_gold
from app.data.loader import SYMBOLS, load_prices
from app.models import train_baseline, train_lstm
from app.models.predict import MODEL_NAMES, forecast

load_dotenv()

app = FastAPI(title=os.environ.get("APP_NAME", "Price Oracle") + " API")

_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _allowed_origins == "*" else _allowed_origins.split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/history/{symbol}")
def history(symbol: str, days: int = 90):
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
def predict(symbol: str, model: str = "random_forest", horizon: int = 7):
    symbol = _validate_symbol(symbol)
    model = _validate_model(model)
    if not 1 <= horizon <= 30:
        raise HTTPException(status_code=400, detail="horizon must be between 1 and 30")

    try:
        predictions = forecast(symbol, model_name=model, horizon=horizon)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {"symbol": symbol, "model": model, "horizon": horizon, "predictions": predictions}


@app.post("/data/refresh")
def refresh_data():
    try:
        for symbol in fetch_crypto.TRADING_PAIRS:
            fetch_crypto.save_coin_history(symbol)
        fetch_gold.save_gold_history()
        train_baseline.main()
        train_lstm.main()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Data refresh failed: {exc}") from exc
    return {"status": "ok"}


@app.post("/data/refresh-gold-price")
def refresh_gold_price():
    try:
        result = fetch_gold.save_goldapi_history()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"GoldAPI refresh failed: {exc}") from exc
    return {"status": "ok", **result}


@app.post("/data/refresh-crypto-coingecko")
def refresh_crypto_coingecko():
    try:
        latest = {}
        for symbol in fetch_crypto_coingecko.COIN_IDS:
            df = fetch_crypto_coingecko.save_coin_history(symbol)
            last = df.iloc[-1]
            latest[symbol] = {"date": str(last["date"]), "price": float(last["price"])}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"CoinGecko refresh failed: {exc}") from exc
    return {"status": "ok", "latest": latest}


@app.post("/data/refresh-crypto-yahoo")
def refresh_crypto_yahoo():
    try:
        latest = {}
        for symbol in fetch_crypto_yahoo.YAHOO_TICKERS:
            df = fetch_crypto_yahoo.save_coin_history(symbol)
            last = df.iloc[-1]
            latest[symbol] = {"date": str(last["date"]), "price": float(last["price"])}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Yahoo Finance refresh failed: {exc}") from exc
    return {"status": "ok", "latest": latest}


@app.post("/data/refresh-fx-rate")
def refresh_fx_rate():
    try:
        latest = fetch_fx.save_usd_vnd_rate()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"FX rate refresh failed: {exc}") from exc
    return {"status": "ok", "latest": latest}

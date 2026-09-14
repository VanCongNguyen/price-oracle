"""Fetch historical gold prices from yfinance, and reference prices from GoldAPI."""

import os
import time
from pathlib import Path

import pandas as pd
import requests
import yfinance as yf
from dotenv import load_dotenv

load_dotenv()

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
GOLD_TICKER = "GC=F"  # COMEX Gold Futures
GOLDAPI_SPOT_URL = "https://www.goldapi.io/api/price/XAU/USD"
GOLDAPI_HISTORY_URL = "https://www.goldapi.io/api/history/XAU/USD"
GOLDAPI_MAX_RANGE_DAYS = 85  # API hard limit is 90 days/request; leave some margin
GOLDAPI_REQUEST_DELAY_SEC = 1.5  # avoid tripping the short-term rate limit between requests


def fetch_gold_history(period: str = "5y", interval: str = "1d"):
    ticker = yf.Ticker(GOLD_TICKER)
    df = ticker.history(period=period, interval=interval)
    df = df.reset_index()[["Date", "Open", "High", "Low", "Close", "Volume"]]
    df.columns = ["date", "open", "high", "low", "close", "volume"]
    return df


def save_gold_history(period: str = "5y", interval: str = "1d") -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    df = fetch_gold_history(period=period, interval=interval)
    out_path = DATA_DIR / "gold_yahoo_finance.csv"
    df.to_csv(out_path, index=False)
    return out_path


def _goldapi_headers() -> dict:
    api_key = os.environ.get("GOLDAPI_KEY")
    if not api_key:
        raise RuntimeError("Missing GOLDAPI_KEY environment variable.")
    return {"x-access-token": api_key, "Content-Type": "application/json"}


def fetch_goldapi_spot_price() -> dict:
    resp = requests.get(GOLDAPI_SPOT_URL, headers=_goldapi_headers(), timeout=15)
    resp.raise_for_status()
    data = resp.json()
    return {
        "date": pd.Timestamp.utcnow().strftime("%Y-%m-%d"),
        "price": data["price"],
    }


def fetch_goldapi_history_range(start: pd.Timestamp, end: pd.Timestamp) -> list[dict]:
    resp = requests.get(
        GOLDAPI_HISTORY_URL,
        params={"from": start.strftime("%Y-%m-%d"), "to": end.strftime("%Y-%m-%d")},
        headers=_goldapi_headers(),
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["prices"]


def save_goldapi_history(days: int = 365) -> dict:
    """GoldAPI caps each request at 90 days, so this fetches in sequential
    chunks; saved to a separate file (gold_goldapi.csv) to compare against
    the primary yfinance source."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    end = pd.Timestamp.utcnow().normalize()
    start = end - pd.Timedelta(days=days)

    rows = []
    chunk_start = start
    while chunk_start < end:
        chunk_end = min(chunk_start + pd.Timedelta(days=GOLDAPI_MAX_RANGE_DAYS), end)
        rows.extend(fetch_goldapi_history_range(chunk_start, chunk_end))
        chunk_start = chunk_end + pd.Timedelta(days=1)
        if chunk_start < end:
            time.sleep(GOLDAPI_REQUEST_DELAY_SEC)

    latest = fetch_goldapi_spot_price()
    rows.append(latest)

    df = pd.DataFrame(rows).drop_duplicates(subset="date", keep="last").sort_values("date")
    out_path = DATA_DIR / "gold_goldapi.csv"
    df.to_csv(out_path, index=False)
    return {"latest": latest, "days_fetched": len(df)}


if __name__ == "__main__":
    path = save_gold_history()
    print(f"Saved gold price history to {path}")

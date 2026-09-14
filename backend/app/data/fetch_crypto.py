"""Fetch historical coin prices from the Binance API and save to CSV."""

from pathlib import Path

import pandas as pd
import requests

from app.data.archive import save_dated_csv

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
BINANCE_BASE = "https://api.binance.com/api/v3"

TRADING_PAIRS = {
    "btc": "BTCUSDT",
    "eth": "ETHUSDT",
    "uni": "UNIUSDT",
}

KLINE_COLUMNS = [
    "open_time",
    "open",
    "high",
    "low",
    "close",
    "volume",
    "close_time",
    "quote_volume",
    "trades",
    "taker_base_volume",
    "taker_quote_volume",
    "ignore",
]


def fetch_coin_history(pair: str, interval: str = "1d", days: int = 365) -> pd.DataFrame:
    url = f"{BINANCE_BASE}/klines"
    # Binance caps klines at 1000 candles per request.
    params = {"symbol": pair, "interval": interval, "limit": min(days, 1000)}
    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    payload = resp.json()

    df = pd.DataFrame(payload, columns=KLINE_COLUMNS)
    df["date"] = pd.to_datetime(df["open_time"], unit="ms").dt.date
    df["price"] = df["close"].astype(float)
    df["volume"] = df["volume"].astype(float)
    return df[["date", "price", "volume"]].drop_duplicates(subset="date")


def save_coin_history(symbol: str, days: int = 365) -> Path:
    pair = TRADING_PAIRS[symbol]
    df = fetch_coin_history(pair, days=days)
    base_path = DATA_DIR / f"{symbol}_binance.csv"
    return save_dated_csv(df, base_path)


if __name__ == "__main__":
    for symbol in TRADING_PAIRS:
        path = save_coin_history(symbol)
        print(f"Saved {symbol} price history to {path}")

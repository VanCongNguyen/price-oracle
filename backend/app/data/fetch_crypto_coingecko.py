"""Lấy giá coin tham khảo từ CoinGecko, lưu file riêng để so sánh với nguồn chính (Binance)."""

from pathlib import Path

import pandas as pd
import requests

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
COINGECKO_BASE = "https://api.coingecko.com/api/v3"
# CoinGecko's edge protection resets connections that use the default
# python-requests user agent, so a browser-like one is required.
HEADERS = {"User-Agent": "Mozilla/5.0"}

COIN_IDS = {
    "btc": "bitcoin",
    "eth": "ethereum",
    "uni": "uniswap",
}


def fetch_coin_history(coin_id: str, vs_currency: str = "usd", days: int = 365) -> pd.DataFrame:
    url = f"{COINGECKO_BASE}/coins/{coin_id}/market_chart"
    params = {"vs_currency": vs_currency, "days": days, "interval": "daily"}
    resp = requests.get(url, params=params, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    payload = resp.json()

    prices = pd.DataFrame(payload["prices"], columns=["timestamp", "price"])
    volumes = pd.DataFrame(payload["total_volumes"], columns=["timestamp", "volume"])

    df = prices.merge(volumes, on="timestamp")
    df["date"] = pd.to_datetime(df["timestamp"], unit="ms").dt.date
    df = df[["date", "price", "volume"]].drop_duplicates(subset="date")
    return df


def save_coin_history(symbol: str, days: int = 365) -> pd.DataFrame:
    coin_id = COIN_IDS[symbol]
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    df = fetch_coin_history(coin_id, days=days)
    out_path = DATA_DIR / f"{symbol}_coingecko.csv"
    df.to_csv(out_path, index=False)
    return df


if __name__ == "__main__":
    for symbol in COIN_IDS:
        df = save_coin_history(symbol)
        print(f"Saved {symbol} price history to {DATA_DIR / f'{symbol}_coingecko.csv'}")

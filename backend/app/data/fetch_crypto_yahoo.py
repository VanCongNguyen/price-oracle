"""Fetch reference coin prices from Yahoo Finance, saved to a separate file for comparison against the primary source (Binance)."""

from pathlib import Path

import pandas as pd
import yfinance as yf

from app.data.archive import save_dated_csv

DATA_DIR = Path(__file__).resolve().parents[2] / "data"

# UNI on Yahoo Finance uses a numeric-suffixed ticker (UNI7083-USD) because
# "UNI-USD" is a different ticker that stopped updating years ago.
YAHOO_TICKERS = {
    "btc": "BTC-USD",
    "eth": "ETH-USD",
    "uni": "UNI7083-USD",
}


def fetch_coin_history(ticker: str, days: int = 365, interval: str = "1d"):
    end = pd.Timestamp.utcnow().normalize()
    start = end - pd.Timedelta(days=days)
    df = yf.Ticker(ticker).history(start=start, end=end, interval=interval)
    df = df.reset_index()[["Date", "Close", "Volume"]]
    df.columns = ["date", "price", "volume"]
    return df


def save_coin_history(symbol: str, days: int = 365, interval: str = "1d"):
    ticker = YAHOO_TICKERS[symbol]
    df = fetch_coin_history(ticker, days=days, interval=interval)
    base_path = DATA_DIR / f"{symbol}_yahoo_finance.csv"
    save_dated_csv(df, base_path)
    return df


if __name__ == "__main__":
    for symbol in YAHOO_TICKERS:
        df = save_coin_history(symbol)
        print(f"Saved {symbol} price history ({len(df)} rows)")

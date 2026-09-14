"""Fetch reference coin prices from Yahoo Finance, saved to a separate file for comparison against the primary source (Binance)."""

from pathlib import Path

import yfinance as yf

DATA_DIR = Path(__file__).resolve().parents[2] / "data"

# UNI on Yahoo Finance uses a numeric-suffixed ticker (UNI7083-USD) because
# "UNI-USD" is a different ticker that stopped updating years ago.
YAHOO_TICKERS = {
    "btc": "BTC-USD",
    "eth": "ETH-USD",
    "uni": "UNI7083-USD",
}


def fetch_coin_history(ticker: str, period: str = "1y", interval: str = "1d"):
    df = yf.Ticker(ticker).history(period=period, interval=interval)
    df = df.reset_index()[["Date", "Close", "Volume"]]
    df.columns = ["date", "price", "volume"]
    return df


def save_coin_history(symbol: str, period: str = "1y", interval: str = "1d"):
    ticker = YAHOO_TICKERS[symbol]
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    df = fetch_coin_history(ticker, period=period, interval=interval)
    out_path = DATA_DIR / f"{symbol}_yahoo_finance.csv"
    df.to_csv(out_path, index=False)
    return df


if __name__ == "__main__":
    for symbol in YAHOO_TICKERS:
        df = save_coin_history(symbol)
        print(f"Saved {symbol} price history to {DATA_DIR / f'{symbol}_yahoo_finance.csv'}")

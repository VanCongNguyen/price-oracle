"""Lấy giá coin tham khảo từ Yahoo Finance, lưu file riêng để so sánh với nguồn chính (Binance)."""

from pathlib import Path

import yfinance as yf

DATA_DIR = Path(__file__).resolve().parents[2] / "data"

# UNI trên Yahoo Finance dùng ticker có hậu tố số (UNI7083-USD) vì "UNI-USD"
# là 1 ticker khác đã ngừng cập nhật.
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

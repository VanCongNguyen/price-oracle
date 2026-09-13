"""Lấy dữ liệu giá vàng lịch sử từ yfinance và lưu ra CSV."""

from pathlib import Path

import yfinance as yf

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
GOLD_TICKER = "GC=F"  # COMEX Gold Futures


def fetch_gold_history(period: str = "5y", interval: str = "1d"):
    ticker = yf.Ticker(GOLD_TICKER)
    df = ticker.history(period=period, interval=interval)
    df = df.reset_index()[["Date", "Open", "High", "Low", "Close", "Volume"]]
    df.columns = ["date", "open", "high", "low", "close", "volume"]
    return df


def save_gold_history(period: str = "5y", interval: str = "1d") -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    df = fetch_gold_history(period=period, interval=interval)
    out_path = DATA_DIR / "gold.csv"
    df.to_csv(out_path, index=False)
    return out_path


if __name__ == "__main__":
    path = save_gold_history()
    print(f"Saved gold price history to {path}")

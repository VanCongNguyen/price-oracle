"""Load các file CSV giá đã fetch thành DataFrame chuẩn hoá: date, price, volume."""

from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).resolve().parents[2] / "data"

SYMBOLS = ("btc", "eth", "gold", "uni")

PRIMARY_FILES = {
    "btc": "btc_binance.csv",
    "eth": "eth_binance.csv",
    "uni": "uni_binance.csv",
    "gold": "gold_yahoo_finance.csv",
}


def load_raw(symbol: str) -> pd.DataFrame:
    path = DATA_DIR / PRIMARY_FILES[symbol]
    if not path.exists():
        raise FileNotFoundError(f"Missing data file: {path}. Run the fetch script first.")
    return pd.read_csv(path)


def load_prices(symbol: str) -> pd.DataFrame:
    """Trả về DataFrame với cột date (datetime, không timezone), price, volume."""
    df = load_raw(symbol)

    if symbol == "gold":
        df = df.rename(columns={"close": "price"})
        df = df[["date", "price", "volume"]]

    df["date"] = pd.to_datetime(df["date"], utc=True).dt.tz_localize(None).dt.normalize()
    df = df[["date", "price", "volume"]].dropna(subset=["price"])
    df = df.sort_values("date").drop_duplicates(subset="date").reset_index(drop=True)
    return df

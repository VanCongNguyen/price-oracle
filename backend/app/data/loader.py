"""Load fetched price CSVs into a normalized DataFrame: date, price, volume."""

from pathlib import Path

import pandas as pd

from app.data.archive import latest_dated_csv

DATA_DIR = Path(__file__).resolve().parents[2] / "data"

SYMBOLS = ("btc", "eth", "gold", "uni")

# Suffix of the primary source's dated snapshot filename for each symbol,
# e.g. "btc_binance.csv" matches "2026-09-14_btc_binance.csv". There's no
# fixed undated filename — load_raw() always reads the most recent one.
PRIMARY_FILE_SUFFIXES = {
    "btc": "btc_binance.csv",
    "eth": "eth_binance.csv",
    "uni": "uni_binance.csv",
    "gold": "gold_yahoo_finance.csv",
}


def load_raw(symbol: str) -> pd.DataFrame:
    suffix = PRIMARY_FILE_SUFFIXES[symbol]
    path = latest_dated_csv(DATA_DIR, suffix)
    if path is None:
        raise FileNotFoundError(
            f"Missing data file: no <date>_{suffix} snapshot in {DATA_DIR}. Run the fetch script first."
        )
    return pd.read_csv(path)


def load_prices(symbol: str) -> pd.DataFrame:
    """Returns a DataFrame with columns date (timezone-naive datetime), price, volume."""
    df = load_raw(symbol)

    if symbol == "gold":
        df = df.rename(columns={"close": "price"})
        df = df[["date", "price", "volume"]]

    df["date"] = pd.to_datetime(df["date"], utc=True).dt.tz_localize(None).dt.normalize()
    df = df[["date", "price", "volume"]].dropna(subset=["price"])
    df = df.sort_values("date").drop_duplicates(subset="date").reset_index(drop=True)
    return df

"""Fetch the USD/VND exchange rate for converting reference gold prices to VND."""

from pathlib import Path

import pandas as pd
import requests

from app.data.archive import save_dated_csv

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
FX_URL = "https://open.er-api.com/v6/latest/USD"


def fetch_usd_vnd_rate() -> dict:
    resp = requests.get(FX_URL, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    if data.get("result") != "success":
        raise RuntimeError(f"FX API returned result={data.get('result')!r}")
    return {
        "date": pd.Timestamp.utcnow().strftime("%Y-%m-%d"),
        "rate": data["rates"]["VND"],
    }


def save_usd_vnd_rate() -> dict:
    latest = fetch_usd_vnd_rate()
    base_path = DATA_DIR / "usd_vnd_exchangerate.csv"
    save_dated_csv(pd.DataFrame([latest]), base_path)
    return latest


if __name__ == "__main__":
    print(save_usd_vnd_rate())

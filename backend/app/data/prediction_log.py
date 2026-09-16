"""Log every prediction served, so past forecasts can later be compared
against what actually happened once the target date arrives. Without this,
a forecast is only ever checked against the backtest metrics computed at
training time, never against genuinely live, out-of-sample outcomes."""

from pathlib import Path
from typing import Optional

import pandas as pd

from app.data.loader import load_prices

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
LOG_PATH = DATA_DIR / "predictions_log.csv"
LOG_COLUMNS = ["logged_date", "symbol", "model", "target_date", "predicted_price"]


def log_prediction(symbol: str, model_name: str, predictions: list[dict]) -> None:
    """Append today's forecast to the log. Keyed by (logged_date, symbol,
    model, target_date) so calling this repeatedly the same day (e.g. every
    page load) never creates duplicate rows, but a later call with a longer
    horizon than an earlier one that same day still adds the new dates."""
    today = pd.Timestamp.utcnow().strftime("%Y-%m-%d")
    new_rows = pd.DataFrame(
        [
            {
                "logged_date": today,
                "symbol": symbol,
                "model": model_name,
                "target_date": p["date"],
                "predicted_price": p["price"],
            }
            for p in predictions
        ],
        columns=LOG_COLUMNS,
    )

    if LOG_PATH.exists():
        existing = pd.read_csv(LOG_PATH)
        combined = pd.concat([existing, new_rows], ignore_index=True)
    else:
        combined = new_rows

    combined = combined.drop_duplicates(
        subset=["logged_date", "symbol", "model", "target_date"], keep="first"
    )
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    combined.to_csv(LOG_PATH, index=False)


def compare_with_actual(symbol: str, model_name: Optional[str] = None) -> list[dict]:
    """Join logged predictions whose target_date has already happened
    against the actual price on that date."""
    if not LOG_PATH.exists():
        return []

    log_df = pd.read_csv(LOG_PATH)
    log_df = log_df[log_df["symbol"] == symbol]
    if model_name:
        log_df = log_df[log_df["model"] == model_name]
    if log_df.empty:
        return []

    actual_df = load_prices(symbol)[["date", "price"]].copy()
    actual_df["date"] = actual_df["date"].dt.strftime("%Y-%m-%d")

    merged = log_df.merge(actual_df, left_on="target_date", right_on="date", how="inner")
    if merged.empty:
        return []

    merged["error_pct"] = (merged["predicted_price"] - merged["price"]) / merged["price"] * 100
    merged = merged.sort_values("target_date", ascending=False)

    return [
        {
            "logged_date": row.logged_date,
            "target_date": row.target_date,
            "model": row.model,
            "predicted_price": float(row.predicted_price),
            "actual_price": float(row.price),
            "error_pct": float(row.error_pct),
        }
        for row in merged.itertuples()
    ]

"""Huấn luyện model baseline (Linear Regression, Random Forest) cho từng loại tài sản."""

import json
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error

from app.data.loader import SYMBOLS, load_prices
from app.preprocessing import FEATURE_COLUMNS, build_dataset

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"
TEST_RATIO = 0.2


def time_split(df, test_ratio: float = TEST_RATIO):
    split_idx = int(len(df) * (1 - test_ratio))
    return df.iloc[:split_idx], df.iloc[split_idx:]


def evaluate(model, X_test, y_test) -> dict:
    preds = model.predict(X_test)
    mae = mean_absolute_error(y_test, preds)
    rmse = float(np.sqrt(mean_squared_error(y_test, preds)))
    mape = float(np.mean(np.abs((y_test - preds) / y_test)) * 100)
    return {"mae": mae, "rmse": rmse, "mape_pct": mape}


def train_symbol(symbol: str) -> dict:
    raw = load_prices(symbol)
    dataset = build_dataset(raw)

    train_df, test_df = time_split(dataset)
    X_train, y_train = train_df[FEATURE_COLUMNS], train_df["target"]
    X_test, y_test = test_df[FEATURE_COLUMNS], test_df["target"]

    linear = LinearRegression().fit(X_train, y_train)
    forest = RandomForestRegressor(n_estimators=300, max_depth=8, random_state=42).fit(
        X_train, y_train
    )

    metrics = {
        "linear": evaluate(linear, X_test, y_test),
        "random_forest": evaluate(forest, X_test, y_test),
        "n_train": len(train_df),
        "n_test": len(test_df),
    }

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(linear, ARTIFACTS_DIR / f"{symbol}_linear.joblib")
    joblib.dump(forest, ARTIFACTS_DIR / f"{symbol}_random_forest.joblib")

    return metrics


def main():
    all_metrics = {}
    for symbol in SYMBOLS:
        print(f"Training models for {symbol}...")
        all_metrics[symbol] = train_symbol(symbol)
        print(json.dumps(all_metrics[symbol], indent=2))

    with open(ARTIFACTS_DIR / "baseline_metrics.json", "w") as f:
        json.dump(all_metrics, f, indent=2)


if __name__ == "__main__":
    main()

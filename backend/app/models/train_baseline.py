"""Train baseline models (Linear Regression, Random Forest) for each asset."""

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


def evaluate(model, X_test, anchor_price, actual_price) -> dict:
    """The model predicts % price change; convert back to an absolute price
    (anchor_price * (1 + % change)) so it's comparable to the actual price."""
    pred_return = model.predict(X_test)
    pred_price = anchor_price.to_numpy() * (1 + pred_return)
    actual = actual_price.to_numpy()
    mae = mean_absolute_error(actual, pred_price)
    rmse = float(np.sqrt(mean_squared_error(actual, pred_price)))
    mape = float(np.mean(np.abs((actual - pred_price) / actual)) * 100)
    return {"mae": mae, "rmse": rmse, "mape_pct": mape}


def train_symbol(symbol: str) -> dict:
    raw = load_prices(symbol)
    dataset = build_dataset(raw)

    train_df, test_df = time_split(dataset)
    X_train, y_train = train_df[FEATURE_COLUMNS], train_df["target_return"]
    X_test = test_df[FEATURE_COLUMNS]

    linear = LinearRegression().fit(X_train, y_train)
    forest = RandomForestRegressor(n_estimators=300, max_depth=8, random_state=42).fit(
        X_train, y_train
    )

    anchor_price, actual_price = test_df["lag_1"], test_df["price"]
    metrics = {
        "linear": evaluate(linear, X_test, anchor_price, actual_price),
        "random_forest": evaluate(forest, X_test, anchor_price, actual_price),
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

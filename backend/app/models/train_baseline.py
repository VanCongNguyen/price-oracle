"""Train baseline models (Linear Regression, Random Forest) for each asset."""

import json
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import TimeSeriesSplit

from app.data.loader import SYMBOLS, load_prices
from app.preprocessing import FEATURE_COLUMNS, build_horizon_dataset

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"
TEST_RATIO = 0.2
MODEL_FEATURE_COLUMNS = list(FEATURE_COLUMNS) + ["horizon"]

RF_MAX_DEPTH_GRID = (6, 10, 14)
RF_CV_SPLITS = 3
RF_CV_N_ESTIMATORS = 150
RF_FINAL_N_ESTIMATORS = 300


def time_split_by_date(df, test_ratio: float = TEST_RATIO):
    """Split by anchor date (not row count) since rows are now date x horizon —
    splitting by row count would leak some horizons of a boundary date into both
    the train and test sets."""
    dates = np.sort(df["date"].unique())
    split_date = dates[int(len(dates) * (1 - test_ratio))]
    train_df = df[df["date"] < split_date].reset_index(drop=True)
    test_df = df[df["date"] >= split_date].reset_index(drop=True)
    return train_df, test_df


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


def _select_rf_max_depth(X_train, y_train) -> int:
    """Small time-series CV grid search: cheap n_estimators during the search,
    the winning depth gets refit at full size on the whole train set."""
    tscv = TimeSeriesSplit(n_splits=RF_CV_SPLITS)
    best_depth, best_score = RF_MAX_DEPTH_GRID[0], float("inf")
    for depth in RF_MAX_DEPTH_GRID:
        scores = []
        for train_idx, val_idx in tscv.split(X_train):
            model = RandomForestRegressor(
                n_estimators=RF_CV_N_ESTIMATORS, max_depth=depth, random_state=42
            ).fit(X_train.iloc[train_idx], y_train.iloc[train_idx])
            pred = model.predict(X_train.iloc[val_idx])
            scores.append(mean_absolute_error(y_train.iloc[val_idx], pred))
        avg_score = float(np.mean(scores))
        if avg_score < best_score:
            best_score, best_depth = avg_score, depth
    return best_depth


def train_symbol(symbol: str) -> dict:
    raw = load_prices(symbol)
    dataset = build_horizon_dataset(raw)
    train_df, test_df = time_split_by_date(dataset)
    train_df = train_df.sort_values("date").reset_index(drop=True)

    X_train, y_train = train_df[MODEL_FEATURE_COLUMNS], train_df["target_return"]
    X_test = test_df[MODEL_FEATURE_COLUMNS]

    linear = LinearRegression().fit(X_train, y_train)

    chosen_max_depth = _select_rf_max_depth(X_train, y_train)
    forest = RandomForestRegressor(
        n_estimators=RF_FINAL_N_ESTIMATORS, max_depth=chosen_max_depth, random_state=42
    ).fit(X_train, y_train)

    anchor_price, actual_price = test_df["price"], test_df["price"] * (1 + test_df["target_return"])
    metrics = {
        "linear": evaluate(linear, X_test, anchor_price, actual_price),
        "random_forest": {**evaluate(forest, X_test, anchor_price, actual_price), "chosen_max_depth": chosen_max_depth},
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

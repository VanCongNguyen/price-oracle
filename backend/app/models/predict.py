"""Iterative forecasting: predict one day at a time, then feed that price back
in as a lag feature for the next step."""

from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import torch

from app.data.loader import load_prices
from app.models.lstm_model import SEQ_LEN, PriceLSTM
from app.preprocessing import FEATURE_COLUMNS, LAG_DAYS, ROLLING_WINDOWS, clean_prices

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"

MODEL_FILENAMES = {
    "linear": "{symbol}_linear.joblib",
    "random_forest": "{symbol}_random_forest.joblib",
}

MODEL_NAMES = ("linear", "random_forest", "lstm")


def load_model(symbol: str, model_name: str):
    filename = MODEL_FILENAMES[model_name].format(symbol=symbol)
    path = ARTIFACTS_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"Model not found: {path}. Run training first.")
    return joblib.load(path)


def _build_feature_row(history: pd.Series) -> dict:
    row = {}
    for lag in LAG_DAYS:
        row[f"lag_{lag}"] = history.iloc[-lag]
    for window in ROLLING_WINDOWS:
        recent = history.iloc[-window:]
        row[f"rolling_mean_{window}"] = recent.mean()
        row[f"rolling_std_{window}"] = recent.std()
    row["pct_change_1"] = (history.iloc[-1] - history.iloc[-2]) / history.iloc[-2]
    return row


def _forecast_baseline(symbol: str, model_name: str, horizon: int, history: pd.Series) -> list[dict]:
    model = load_model(symbol, model_name)
    last_date = history.index[-1]

    predictions = []
    for step in range(1, horizon + 1):
        feature_row = _build_feature_row(history)
        X = pd.DataFrame([feature_row])[FEATURE_COLUMNS]
        pred_return = float(model.predict(X)[0])
        pred_price = history.iloc[-1] * (1 + pred_return)
        pred_date = last_date + pd.Timedelta(days=step)
        predictions.append({"date": pred_date.strftime("%Y-%m-%d"), "price": pred_price})
        history.loc[pred_date] = pred_price

    return predictions


def _forecast_lstm(symbol: str, horizon: int, history: pd.Series) -> list[dict]:
    scaler = joblib.load(ARTIFACTS_DIR / f"{symbol}_lstm_scaler.joblib")
    model = PriceLSTM()
    model.load_state_dict(torch.load(ARTIFACTS_DIR / f"{symbol}_lstm.pt", weights_only=True))
    model.eval()

    last_date = history.index[-1]
    scaled_history = scaler.transform(history.values.reshape(-1, 1)).flatten().tolist()

    predictions = []
    with torch.no_grad():
        for step in range(1, horizon + 1):
            window = np.array(scaled_history[-SEQ_LEN:], dtype=np.float32).reshape(1, SEQ_LEN, 1)
            pred_scaled = model(torch.tensor(window)).item()
            pred_price = float(scaler.inverse_transform([[pred_scaled]])[0][0])
            pred_date = last_date + pd.Timedelta(days=step)
            predictions.append({"date": pred_date.strftime("%Y-%m-%d"), "price": pred_price})
            scaled_history.append(pred_scaled)

    return predictions


def forecast(symbol: str, model_name: str = "random_forest", horizon: int = 7) -> list[dict]:
    raw = load_prices(symbol)
    cleaned = clean_prices(raw)
    history = cleaned.set_index("date")["price"].copy()

    if model_name == "lstm":
        return _forecast_lstm(symbol, horizon, history)
    return _forecast_baseline(symbol, model_name, horizon, history)

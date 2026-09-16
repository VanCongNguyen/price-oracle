"""Direct multi-horizon forecasting: every model predicts the whole requested
horizon in one call from real, known history — no feeding predicted days back
in as input for the next step (that compounds error the further out it goes)."""

import json
from pathlib import Path

import joblib
import pandas as pd
import torch

from app.data.loader import load_prices
from app.models.ensemble import ENSEMBLE_MODELS
from app.models.lstm_model import SEQ_LEN, PriceLSTM
from app.preprocessing import FEATURE_COLUMNS, add_features, clean_prices

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"

MODEL_FILENAMES = {
    "linear": "{symbol}_linear.joblib",
    "random_forest": "{symbol}_random_forest.joblib",
}

MODEL_NAMES = ("linear", "random_forest", "lstm", "ensemble")
MODEL_FEATURE_COLUMNS = list(FEATURE_COLUMNS) + ["horizon"]


def load_model(symbol: str, model_name: str):
    filename = MODEL_FILENAMES[model_name].format(symbol=symbol)
    path = ARTIFACTS_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"Model not found: {path}. Run training first.")
    return joblib.load(path)


def _load_lstm_hidden_size(symbol: str) -> int:
    path = ARTIFACTS_DIR / f"{symbol}_lstm_config.json"
    if not path.exists():
        raise FileNotFoundError(f"LSTM config not found: {path}. Run training first.")
    with open(path) as f:
        return json.load(f)["hidden_size"]


def _forecast_baseline(symbol: str, model_name: str, horizon: int, cleaned: pd.DataFrame) -> list[dict]:
    model = load_model(symbol, model_name)
    anchor = add_features(cleaned).iloc[-1]
    last_date, anchor_price = anchor["date"], anchor["price"]

    rows = []
    for h in range(1, horizon + 1):
        row = {col: anchor[col] for col in FEATURE_COLUMNS}
        row["horizon"] = h
        rows.append(row)
    X = pd.DataFrame(rows)[MODEL_FEATURE_COLUMNS]
    pred_returns = model.predict(X)

    predictions = []
    for h, pred_return in zip(range(1, horizon + 1), pred_returns):
        pred_date = last_date + pd.Timedelta(days=h)
        predictions.append({"date": pred_date.strftime("%Y-%m-%d"), "price": anchor_price * (1 + float(pred_return))})
    return predictions


def _forecast_lstm(symbol: str, horizon: int, price_history: pd.Series) -> list[dict]:
    hidden_size = _load_lstm_hidden_size(symbol)
    scaler = joblib.load(ARTIFACTS_DIR / f"{symbol}_lstm_scaler.joblib")
    model = PriceLSTM(hidden_size=hidden_size)
    model.load_state_dict(torch.load(ARTIFACTS_DIR / f"{symbol}_lstm.pt", weights_only=True))
    model.eval()

    last_date = price_history.index[-1]
    scaled_history = scaler.transform(price_history.values.reshape(-1, 1)).flatten()
    window = torch.tensor(scaled_history[-SEQ_LEN:], dtype=torch.float32).reshape(1, SEQ_LEN, 1)

    with torch.no_grad():
        pred_scaled = model(window).numpy().flatten()
    pred_prices = scaler.inverse_transform(pred_scaled.reshape(-1, 1)).flatten()

    predictions = []
    for h in range(1, horizon + 1):
        pred_date = last_date + pd.Timedelta(days=h)
        predictions.append({"date": pred_date.strftime("%Y-%m-%d"), "price": float(pred_prices[h - 1])})
    return predictions


def _forecast_ensemble(symbol: str, horizon: int, cleaned: pd.DataFrame) -> list[dict]:
    weights_path = ARTIFACTS_DIR / "ensemble_weights.json"
    if not weights_path.exists():
        raise FileNotFoundError(f"Ensemble weights not found: {weights_path}. Run training first.")
    with open(weights_path) as f:
        weights = json.load(f)[symbol]

    price_history = cleaned.set_index("date")["price"].copy()
    per_model = {
        "linear": _forecast_baseline(symbol, "linear", horizon, cleaned),
        "random_forest": _forecast_baseline(symbol, "random_forest", horizon, cleaned),
        "lstm": _forecast_lstm(symbol, horizon, price_history),
    }

    predictions = []
    for i in range(horizon):
        blended = sum(weights[name] * per_model[name][i]["price"] for name in ENSEMBLE_MODELS)
        predictions.append({"date": per_model["linear"][i]["date"], "price": blended})
    return predictions


def forecast(symbol: str, model_name: str = "random_forest", horizon: int = 7) -> list[dict]:
    raw = load_prices(symbol)
    cleaned = clean_prices(raw)

    if model_name == "lstm":
        price_history = cleaned.set_index("date")["price"].copy()
        return _forecast_lstm(symbol, horizon, price_history)
    if model_name == "ensemble":
        return _forecast_ensemble(symbol, horizon, cleaned)
    return _forecast_baseline(symbol, model_name, horizon, cleaned)

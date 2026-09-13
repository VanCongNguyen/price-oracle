"""Huấn luyện model LSTM dự đoán giá theo chuỗi thời gian."""

import json
from pathlib import Path

import joblib
import numpy as np
import torch
from sklearn.preprocessing import MinMaxScaler
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

from app.data.loader import SYMBOLS, load_prices
from app.models.lstm_model import SEQ_LEN, PriceLSTM
from app.preprocessing import clean_prices

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"
TEST_RATIO = 0.2
EPOCHS = 100
BATCH_SIZE = 32
LEARNING_RATE = 1e-3
PATIENCE = 10


def make_sequences(values: np.ndarray, seq_len: int):
    X, y = [], []
    for i in range(len(values) - seq_len):
        X.append(values[i : i + seq_len])
        y.append(values[i + seq_len])
    return np.array(X), np.array(y)


def train_symbol(symbol: str) -> dict:
    raw = load_prices(symbol)
    cleaned = clean_prices(raw)
    prices = cleaned["price"].values.reshape(-1, 1)

    split_idx = int(len(prices) * (1 - TEST_RATIO))
    scaler = MinMaxScaler()
    scaler.fit(prices[:split_idx])
    scaled = scaler.transform(prices)

    X, y = make_sequences(scaled.flatten(), SEQ_LEN)
    train_end = split_idx - SEQ_LEN

    X_train, y_train = X[:train_end], y[:train_end]
    X_test, y_test = X[train_end:], y[train_end:]

    train_ds = TensorDataset(
        torch.tensor(X_train, dtype=torch.float32).unsqueeze(-1),
        torch.tensor(y_train, dtype=torch.float32),
    )
    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)

    X_test_t = torch.tensor(X_test, dtype=torch.float32).unsqueeze(-1)
    y_test_t = torch.tensor(y_test, dtype=torch.float32)

    model = PriceLSTM()
    optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)
    loss_fn = nn.MSELoss()

    best_loss = float("inf")
    best_state = None
    patience_left = PATIENCE

    for epoch in range(1, EPOCHS + 1):
        model.train()
        for xb, yb in train_loader:
            optimizer.zero_grad()
            pred = model(xb)
            loss = loss_fn(pred, yb)
            loss.backward()
            optimizer.step()

        model.eval()
        with torch.no_grad():
            val_pred = model(X_test_t)
            val_loss = loss_fn(val_pred, y_test_t).item()

        if val_loss < best_loss:
            best_loss = val_loss
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
            patience_left = PATIENCE
        else:
            patience_left -= 1
            if patience_left <= 0:
                break

    model.load_state_dict(best_state)

    model.eval()
    with torch.no_grad():
        test_pred_scaled = model(X_test_t).numpy()

    test_pred = scaler.inverse_transform(test_pred_scaled.reshape(-1, 1)).flatten()
    test_actual = scaler.inverse_transform(y_test.reshape(-1, 1)).flatten()

    mae = float(np.mean(np.abs(test_pred - test_actual)))
    rmse = float(np.sqrt(np.mean((test_pred - test_actual) ** 2)))
    mape = float(np.mean(np.abs((test_actual - test_pred) / test_actual)) * 100)

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), ARTIFACTS_DIR / f"{symbol}_lstm.pt")
    joblib.dump(scaler, ARTIFACTS_DIR / f"{symbol}_lstm_scaler.joblib")

    return {
        "mae": mae,
        "rmse": rmse,
        "mape_pct": mape,
        "n_train": len(X_train),
        "n_test": len(X_test),
        "epochs_ran": epoch,
    }


def main():
    all_metrics = {}
    for symbol in SYMBOLS:
        print(f"Training LSTM for {symbol}...")
        all_metrics[symbol] = train_symbol(symbol)
        print(json.dumps(all_metrics[symbol], indent=2))

    with open(ARTIFACTS_DIR / "lstm_metrics.json", "w") as f:
        json.dump(all_metrics, f, indent=2)


if __name__ == "__main__":
    main()

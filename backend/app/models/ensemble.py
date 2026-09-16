"""Combine per-model test accuracy into ensemble blend weights."""

import json
from pathlib import Path

from app.data.loader import SYMBOLS

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"
ENSEMBLE_MODELS = ("linear", "random_forest", "lstm")


def compute_weights() -> dict:
    """Run after both trainers finish. Weights a symbol's models inversely to
    their test MAPE, so the ensemble leans on whichever model tested most
    accurate for that symbol instead of splitting evenly."""
    with open(ARTIFACTS_DIR / "baseline_metrics.json") as f:
        baseline_metrics = json.load(f)
    with open(ARTIFACTS_DIR / "lstm_metrics.json") as f:
        lstm_metrics = json.load(f)

    all_weights = {}
    for symbol in SYMBOLS:
        mape = {
            "linear": baseline_metrics[symbol]["linear"]["mape_pct"],
            "random_forest": baseline_metrics[symbol]["random_forest"]["mape_pct"],
            "lstm": lstm_metrics[symbol]["mape_pct"],
        }
        inverse = {name: 1 / max(m, 1e-6) for name, m in mape.items()}
        total = sum(inverse.values())
        all_weights[symbol] = {name: v / total for name, v in inverse.items()}

    with open(ARTIFACTS_DIR / "ensemble_weights.json", "w") as f:
        json.dump(all_weights, f, indent=2)
    return all_weights

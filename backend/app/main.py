"""FastAPI app expose các endpoint lấy lịch sử giá và dự đoán."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.data.loader import SYMBOLS, load_prices
from app.models.predict import MODEL_NAMES, forecast

app = FastAPI(title="Price Oracle API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _validate_symbol(symbol: str) -> str:
    symbol = symbol.lower()
    if symbol not in SYMBOLS:
        raise HTTPException(status_code=404, detail=f"Unknown symbol '{symbol}'. Use one of {SYMBOLS}.")
    return symbol


def _validate_model(model: str) -> str:
    model = model.lower()
    if model not in MODEL_NAMES:
        raise HTTPException(status_code=400, detail=f"Unknown model '{model}'. Use one of {MODEL_NAMES}.")
    return model


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/history/{symbol}")
def history(symbol: str, days: int = 90):
    symbol = _validate_symbol(symbol)
    df = load_prices(symbol).tail(days)
    return {
        "symbol": symbol,
        "history": [
            {"date": row.date.strftime("%Y-%m-%d"), "price": row.price}
            for row in df.itertuples()
        ],
    }


@app.get("/predict/{symbol}")
def predict(symbol: str, model: str = "random_forest", horizon: int = 7):
    symbol = _validate_symbol(symbol)
    model = _validate_model(model)
    if not 1 <= horizon <= 30:
        raise HTTPException(status_code=400, detail="horizon must be between 1 and 30")

    try:
        predictions = forecast(symbol, model_name=model, horizon=horizon)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {"symbol": symbol, "model": model, "horizon": horizon, "predictions": predictions}

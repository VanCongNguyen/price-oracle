"""Clean price data and generate features for model training."""

import pandas as pd

LAG_DAYS = (1, 2, 3, 5, 7)
ROLLING_WINDOWS = (7, 14)
RSI_WINDOW = 14
MACD_FAST, MACD_SLOW, MACD_SIGNAL = 12, 26, 9
VOLATILITY_WINDOW = 14
VOLUME_WINDOW = 7

# Every day we can forecast forward from an anchor day (see build_horizon_dataset).
MAX_HORIZON = 30


def clean_prices(df: pd.DataFrame) -> pd.DataFrame:
    """Forward-fill missing days (weekends/holidays for gold) so the series is
    continuous, which lag features and the LSTM both depend on."""
    df = df.set_index("date").asfreq("D")
    df["price"] = df["price"].ffill()
    df["volume"] = df["volume"].ffill().fillna(0)
    return df.reset_index()


def _rsi(price: pd.Series, window: int) -> pd.Series:
    delta = price.diff()
    gain = delta.clip(lower=0).rolling(window).mean()
    loss = (-delta.clip(upper=0)).rolling(window).mean()
    rs = gain / loss.replace(0, pd.NA)
    return 100 - (100 / (1 + rs))


def _macd_hist(price: pd.Series, fast: int, slow: int, signal: int) -> pd.Series:
    macd_line = price.ewm(span=fast, adjust=False).mean() - price.ewm(span=slow, adjust=False).mean()
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    return macd_line - signal_line


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    for lag in LAG_DAYS:
        df[f"lag_{lag}"] = df["price"].shift(lag)
    for window in ROLLING_WINDOWS:
        df[f"rolling_mean_{window}"] = df["price"].shift(1).rolling(window).mean()
        df[f"rolling_std_{window}"] = df["price"].shift(1).rolling(window).std()
    df["pct_change_1"] = df["price"].shift(1).pct_change(1)
    # RSI/MACD/volatility/volume below use the anchor day's own price (not shifted),
    # unlike the lag/rolling columns above. That's intentional, not a leakage bug:
    # build_horizon_dataset's target is the FUTURE price relative to the anchor day,
    # so the anchor day's own price is legitimately known data, not the thing being
    # predicted (see the leakage-safety note in CLAUDE.md before changing this).
    df["rsi_14"] = _rsi(df["price"], RSI_WINDOW)
    df["macd_hist"] = _macd_hist(df["price"], MACD_FAST, MACD_SLOW, MACD_SIGNAL)
    df["volatility_14"] = df["price"].pct_change(1).rolling(VOLATILITY_WINDOW).std()
    df["volume_rel_7"] = df["volume"] / df["volume"].rolling(VOLUME_WINDOW).mean()
    return df


def build_horizon_dataset(raw_df: pd.DataFrame, max_horizon: int = MAX_HORIZON) -> pd.DataFrame:
    """Direct multi-horizon training set: one row per (anchor day, horizon) pair,
    so a single model call predicts h days ahead directly instead of predicting
    one day and feeding that prediction back in for the next (which compounds
    error the further out the forecast goes)."""
    df = add_features(clean_prices(raw_df))
    df = df.dropna(subset=FEATURE_COLUMNS).reset_index(drop=True)

    frames = []
    for h in range(1, max_horizon + 1):
        n_valid = len(df) - h
        if n_valid <= 0:
            continue
        frame = df.iloc[:n_valid][["date", "price"] + FEATURE_COLUMNS].copy()
        frame["horizon"] = h
        future_price = df["price"].shift(-h).iloc[:n_valid].to_numpy()
        frame["target_return"] = (future_price - frame["price"].to_numpy()) / frame["price"].to_numpy()
        frames.append(frame)
    return pd.concat(frames, ignore_index=True)


FEATURE_COLUMNS = (
    [f"lag_{lag}" for lag in LAG_DAYS]
    + [f"rolling_mean_{w}" for w in ROLLING_WINDOWS]
    + [f"rolling_std_{w}" for w in ROLLING_WINDOWS]
    + ["pct_change_1", "rsi_14", "macd_hist", "volatility_14", "volume_rel_7"]
)

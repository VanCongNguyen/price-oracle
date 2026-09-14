"""Clean price data and generate features for model training."""

import pandas as pd

LAG_DAYS = (1, 2, 3, 5, 7)
ROLLING_WINDOWS = (7, 14)


def clean_prices(df: pd.DataFrame) -> pd.DataFrame:
    """Forward-fill missing days (weekends/holidays for gold) so the series is
    continuous, which lag features and the LSTM both depend on."""
    df = df.set_index("date").asfreq("D")
    df["price"] = df["price"].ffill()
    df["volume"] = df["volume"].ffill().fillna(0)
    return df.reset_index()


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    for lag in LAG_DAYS:
        df[f"lag_{lag}"] = df["price"].shift(lag)
    for window in ROLLING_WINDOWS:
        df[f"rolling_mean_{window}"] = df["price"].shift(1).rolling(window).mean()
        df[f"rolling_std_{window}"] = df["price"].shift(1).rolling(window).std()
    df["pct_change_1"] = df["price"].shift(1).pct_change(1)
    # Target is the day's % price change, not the absolute price level: this keeps
    # Random Forest from needing to extrapolate beyond the price range it trained on
    # (price can hit new highs, but daily % change stays within a familiar range).
    df["target_return"] = df["price"].pct_change(1)
    return df


def build_dataset(raw_df: pd.DataFrame) -> pd.DataFrame:
    """Full pipeline: clean -> feature engineering -> drop rows missing lag/rolling values."""
    df = clean_prices(raw_df)
    df = add_features(df)
    return df.dropna().reset_index(drop=True)


FEATURE_COLUMNS = (
    [f"lag_{lag}" for lag in LAG_DAYS]
    + [f"rolling_mean_{w}" for w in ROLLING_WINDOWS]
    + [f"rolling_std_{w}" for w in ROLLING_WINDOWS]
    + ["pct_change_1"]
)

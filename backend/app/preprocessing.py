"""Làm sạch dữ liệu giá và sinh feature phục vụ huấn luyện model."""

import pandas as pd

LAG_DAYS = (1, 2, 3, 5, 7)
ROLLING_WINDOWS = (7, 14)


def clean_prices(df: pd.DataFrame) -> pd.DataFrame:
    """Điền các ngày bị thiếu (cuối tuần/lễ với vàng) bằng forward-fill để có
    chuỗi thời gian liên tục, cần thiết cho việc tạo lag feature và LSTM."""
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
    df["pct_change_1"] = df["price"].pct_change(1)
    df["target"] = df["price"]
    return df


def build_dataset(raw_df: pd.DataFrame) -> pd.DataFrame:
    """Full pipeline: clean -> feature engineering -> drop hàng thiếu do lag/rolling."""
    df = clean_prices(raw_df)
    df = add_features(df)
    return df.dropna().reset_index(drop=True)


FEATURE_COLUMNS = (
    [f"lag_{lag}" for lag in LAG_DAYS]
    + [f"rolling_mean_{w}" for w in ROLLING_WINDOWS]
    + [f"rolling_std_{w}" for w in ROLLING_WINDOWS]
    + ["pct_change_1"]
)

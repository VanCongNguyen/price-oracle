"""Shared helper for saving fetched data as dated snapshots."""

from pathlib import Path
from typing import Optional

import pandas as pd


def save_dated_csv(df: pd.DataFrame, base_path: Path) -> Path:
    """Save as a `<YYYY-MM-DD>_<base_path.name>` snapshot instead of
    overwriting a fixed filename. Fetch scripts pull a rolling window
    (e.g. the last 365 days); keeping each day as its own file means a
    later fetch never discards a day that has since aged out of that
    window. Read back with `latest_dated_csv()`."""
    base_path.parent.mkdir(parents=True, exist_ok=True)
    today = pd.Timestamp.utcnow().strftime("%Y-%m-%d")
    dated_path = base_path.parent / f"{today}_{base_path.name}"
    df.to_csv(dated_path, index=False)
    return dated_path


def latest_dated_csv(dir_path: Path, suffix: str) -> Optional[Path]:
    """Find the most recent `<date>_<suffix>` snapshot in dir_path (dates
    sort lexicographically since they're YYYY-MM-DD), or None if none exist."""
    candidates = sorted(dir_path.glob(f"*_{suffix}"))
    return candidates[-1] if candidates else None

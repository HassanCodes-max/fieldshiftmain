"""MODIS NDVI processing: seasonal curve, low-vegetation (bare-field) windows, peaks."""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import config as C


def clean_ndvi(df: pd.DataFrame) -> pd.DataFrame:
    d = df.copy()
    d["date"] = pd.to_datetime(d["date"])
    d = d.dropna(subset=["ndvi"])
    d = d[(d["ndvi"] > -0.2) & (d["ndvi"] <= 1)]
    d["year"] = d["date"].dt.year
    d["month"] = d["date"].dt.month
    d["doy"] = d["date"].dt.dayofyear
    # 16-day composite slot (1..23) so the same period aligns across years
    d["slot"] = ((d["doy"] - 1) // 16) + 1
    return d.sort_values("date").reset_index(drop=True)


def ndvi_climatology(d: pd.DataFrame) -> pd.DataFrame:
    g = d.groupby("slot")
    c = pd.DataFrame({
        "ndvi": g["ndvi"].median(),
        "p25": g["ndvi"].quantile(0.25),
        "p75": g["ndvi"].quantile(0.75),
        "n_years": g["year"].nunique(),
    }).reset_index()
    c["doy"] = (c["slot"] - 1) * 16 + 8
    c["date_ref"] = pd.to_datetime("2021-01-01") + pd.to_timedelta(c["doy"] - 1, unit="D")
    c["month"] = c["date_ref"].dt.month
    return c


def low_vegetation_windows(clim: pd.DataFrame, threshold: float | None = None) -> tuple[list[dict], float]:
    """Contiguous periods where the median seasonal NDVI is below a threshold.

    Threshold defaults to the 30th percentile of the seasonal curve, but never above 0.40,
    so that it describes the *relatively bare* part of the year at this location.
    """
    if threshold is None:
        threshold = float(min(0.40, clim["ndvi"].quantile(0.30)))
    below = clim["ndvi"] < threshold
    windows, start = [], None
    slots = clim["slot"].tolist()
    for i, b in enumerate(below):
        if b and start is None:
            start = i
        if (not b or i == len(below) - 1) and start is not None:
            end = i if b else i - 1
            windows.append({
                "start": clim["date_ref"].iloc[start],
                "end": clim["date_ref"].iloc[end] + pd.Timedelta(days=15),
                "min_ndvi": float(clim["ndvi"].iloc[start:end + 1].min()),
                "slots": slots[start:end + 1],
            })
            start = None
    return windows, threshold


def seasonal_peaks(d: pd.DataFrame) -> pd.DataFrame:
    """Per-year peak NDVI for the rabi (Dec–Apr) and kharif (Jul–Oct) seasons."""
    rows = []
    for y, g in d.groupby("year"):
        rabi = g[g["month"].isin([1, 2, 3, 4])]
        kharif = g[g["month"].isin([7, 8, 9, 10])]
        rows.append({
            "year": y,
            "rabi_peak": rabi["ndvi"].max() if len(rabi) else np.nan,
            "rabi_peak_date": rabi.loc[rabi["ndvi"].idxmax(), "date"] if len(rabi) else pd.NaT,
            "kharif_peak": kharif["ndvi"].max() if len(kharif) else np.nan,
            "kharif_peak_date": kharif.loc[kharif["ndvi"].idxmax(), "date"] if len(kharif) else pd.NaT,
        })
    return pd.DataFrame(rows)


def describe_windows(windows: list[dict]) -> str:
    if not windows:
        return "No pronounced low-vegetation period detected."
    parts = [f"{w['start']:%d %b}–{w['end']:%d %b} (NDVI ≈ {w['min_ndvi']:.2f})" for w in windows]
    return "; ".join(parts)


def window_doys(windows: list[dict]) -> set[int]:
    days = set()
    for w in windows:
        for t in pd.date_range(w["start"], w["end"], freq="D"):
            if t.year == 2021:
                days.add(t.dayofyear)
    return days

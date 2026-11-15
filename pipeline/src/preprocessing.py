"""Clean NASA POWER data and derive daily / monthly indicators."""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import config as C


def extraterrestrial_radiation(lat_deg: float, doy: np.ndarray) -> np.ndarray:
    """Ra in MJ m-2 day-1 (FAO-56 eq. 21-25)."""
    phi = np.deg2rad(lat_deg)
    dr = 1 + 0.033 * np.cos(2 * np.pi / 365 * doy)
    delta = 0.409 * np.sin(2 * np.pi / 365 * doy - 1.39)
    ws = np.arccos(np.clip(-np.tan(phi) * np.tan(delta), -1, 1))
    gsc = 0.0820
    return (24 * 60 / np.pi) * gsc * dr * (
        ws * np.sin(phi) * np.sin(delta) + np.cos(phi) * np.cos(delta) * np.sin(ws))


def hargreaves_et0(tmean, tmax, tmin, ra_mj) -> np.ndarray:
    """Reference evapotranspiration, mm/day (FAO-56 eq. 52, Hargreaves)."""
    td = np.clip(tmax - tmin, 0, None)
    return 0.0023 * (tmean + 17.8) * np.sqrt(td) * ra_mj * 0.408


def clean_power(df: pd.DataFrame, lat: float, temp_offset: float = 0.0,
                rain_factor: float = 1.0) -> pd.DataFrame:
    """Standardise columns, fill short gaps, add ET0 and calendar fields.

    temp_offset / rain_factor apply an optional what-if scenario
    (e.g. +1.5 C warming, -10 % rain). Defaults leave the NASA data untouched.
    """
    d = df.copy()
    d["date"] = pd.to_datetime(d["date"])
    d = d.sort_values("date").set_index("date")
    d = d[~d.index.duplicated()]
    full = pd.date_range(d.index.min(), d.index.max(), freq="D")
    d = d.reindex(full)
    d.index.name = "date"
    d["was_missing"] = d["T2M"].isna()
    # interpolate only short gaps (<= 3 days); longer gaps stay NaN and are reported
    d = d.interpolate(limit=3, limit_area="inside")
    for col in ("T2M", "T2M_MAX", "T2M_MIN"):
        if col in d:
            d[col] = d[col] + temp_offset
    if "PRECTOTCORR" in d:
        d["PRECTOTCORR"] = d["PRECTOTCORR"].clip(lower=0) * rain_factor
    doy = d.index.day_of_year.values
    d["RA"] = extraterrestrial_radiation(lat, doy)
    d["ET0"] = hargreaves_et0(d["T2M"].values, d["T2M_MAX"].values,
                              d["T2M_MIN"].values, d["RA"].values)
    d["year"] = d.index.year
    d["month"] = d.index.month
    d["doy"] = doy
    d["hot_day"] = (d["T2M_MAX"] >= C.HOT_DAY_C).astype(int)
    d["heavy_rain_day"] = (d["PRECTOTCORR"] >= C.HEAVY_RAIN_MM).astype(int)
    return d.reset_index()


def complete_years(daily: pd.DataFrame, min_days: int = 360) -> list[int]:
    counts = daily.dropna(subset=["T2M"]).groupby("year").size()
    return [int(y) for y, n in counts.items() if n >= min_days]


def to_monthly(daily: pd.DataFrame) -> pd.DataFrame:
    g = daily.groupby(["year", "month"])
    m = pd.DataFrame({
        "tmean": g["T2M"].mean(),
        "tmax": g["T2M_MAX"].mean(),
        "tmin": g["T2M_MIN"].mean(),
        "tmax_abs": g["T2M_MAX"].max(),
        "rain": g["PRECTOTCORR"].sum(min_count=20),
        "et0": g["ET0"].sum(min_count=20),
        "rh": g["RH2M"].mean(),
        "soil_top": g["GWETTOP"].mean(),
        "soil_root": g["GWETROOT"].mean(),
        "solar": g["ALLSKY_SFC_SW_DWN"].mean(),
        "hot_days": g["hot_day"].sum(),
        "heavy_rain_days": g["heavy_rain_day"].sum(),
        "n_days": g["T2M"].count(),
    }).reset_index()
    m["water_balance"] = m["rain"] - m["et0"]
    m["date"] = pd.to_datetime(dict(year=m["year"], month=m["month"], day=1))
    return m


SEASONS = {
    "Winter (Dec–Feb)": [12, 1, 2],
    "Spring (Mar–Apr)": [3, 4],
    "Pre-monsoon (May–Jun)": [5, 6],
    "Monsoon (Jul–Sep)": [7, 8, 9],
    "Post-monsoon (Oct–Nov)": [10, 11],
}


def season_of(month: int) -> str:
    for name, months in SEASONS.items():
        if month in months:
            return name
    return ""


def to_seasonal(monthly: pd.DataFrame) -> pd.DataFrame:
    m = monthly.copy()
    m["season"] = m["month"].map(season_of)
    # December belongs to the following winter
    m["season_year"] = np.where(m["month"] == 12, m["year"] + 1, m["year"])
    agg = m.groupby(["season_year", "season"]).agg(
        tmax=("tmax", "mean"), tmin=("tmin", "mean"), rain=("rain", "sum"),
        et0=("et0", "sum"), soil_root=("soil_root", "mean"),
        hot_days=("hot_days", "sum"), heavy_rain_days=("heavy_rain_days", "sum"),
    ).reset_index()
    return agg


def data_quality(raw: pd.DataFrame, daily: pd.DataFrame) -> dict:
    return {
        "first_date": daily["date"].min().date().isoformat(),
        "last_date": daily["date"].max().date().isoformat(),
        "n_days": int(len(daily)),
        "missing_days_raw": int(daily["was_missing"].sum()),
        "still_missing_after_fill": int(daily["T2M"].isna().sum()),
        "complete_years": complete_years(daily),
    }

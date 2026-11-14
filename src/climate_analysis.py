"""Climate indicators, trends and month-by-month stress from NASA POWER."""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import config as C


def recent_years(years: list[int], n: int = C.BASELINE_YEARS) -> list[int]:
    return sorted(years)[-n:]


def climatology(monthly: pd.DataFrame, years: list[int]) -> pd.DataFrame:
    m = monthly[monthly["year"].isin(years)]
    clim = m.groupby("month").agg(
        tmean=("tmean", "mean"), tmax=("tmax", "mean"), tmin=("tmin", "mean"),
        rain=("rain", "mean"), rain_p10=("rain", lambda s: s.quantile(0.1)),
        rain_p90=("rain", lambda s: s.quantile(0.9)),
        et0=("et0", "mean"), soil_root=("soil_root", "mean"),
        soil_top=("soil_top", "mean"), rh=("rh", "mean"),
        hot_days=("hot_days", "mean"), heavy_rain_days=("heavy_rain_days", "mean"),
    ).reset_index()
    clim["water_balance"] = clim["rain"] - clim["et0"]
    clim["month_name"] = [C.MONTHS[i - 1] for i in clim["month"]]
    return clim


def annual_summary(daily: pd.DataFrame, years: list[int]) -> pd.DataFrame:
    d = daily[daily["year"].isin(years)]
    g = d.groupby("year")
    out = pd.DataFrame({
        "tmean": g["T2M"].mean(),
        "tmax_mean": g["T2M_MAX"].mean(),
        "rain": g["PRECTOTCORR"].sum(),
        "et0": g["ET0"].sum(),
        "hot_days": g["hot_day"].sum(),
        "heavy_rain_days": g["heavy_rain_day"].sum(),
    })
    marapr = d[d["month"].isin([3, 4])].groupby("year")
    out["wheat_heat_days"] = marapr["T2M_MAX"].apply(lambda s: int((s >= 32).sum()))
    mon = d[d["month"].isin([7, 8, 9])].groupby("year")
    out["monsoon_rain"] = mon["PRECTOTCORR"].sum()
    return out.reset_index()


def linear_trend(x, y) -> tuple[float, float]:
    """Slope per decade and simple r^2 (no significance test is implied)."""
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    ok = ~np.isnan(y)
    if ok.sum() < 5:
        return np.nan, np.nan
    slope, intercept = np.polyfit(x[ok], y[ok], 1)
    pred = slope * x[ok] + intercept
    ss_res = ((y[ok] - pred) ** 2).sum()
    ss_tot = ((y[ok] - y[ok].mean()) ** 2).sum()
    return slope * 10, 1 - ss_res / ss_tot if ss_tot else np.nan


def trends(annual: pd.DataFrame) -> dict:
    res = {}
    for col in ("tmean", "tmax_mean", "rain", "hot_days", "wheat_heat_days", "monsoon_rain"):
        s, r2 = linear_trend(annual["year"], annual[col])
        half = len(annual) // 2
        early = annual[col].iloc[:half].mean()
        late = annual[col].iloc[half:].mean()
        res[col] = {"per_decade": s, "r2": r2, "early_mean": early, "late_mean": late,
                    "early_years": f"{annual['year'].iloc[0]}–{annual['year'].iloc[half - 1]}",
                    "late_years": f"{annual['year'].iloc[half]}–{annual['year'].iloc[-1]}"}
    return res


def level(value, moderate, high, reverse=False) -> int:
    """0 = low, 1 = moderate, 2 = high stress."""
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return -1
    if reverse:
        return 2 if value <= high else 1 if value <= moderate else 0
    return 2 if value >= high else 1 if value >= moderate else 0


def stress_matrix(clim: pd.DataFrame, ndvi_clim: pd.DataFrame | None) -> pd.DataFrame:
    """Month x indicator stress levels with the value that produced them."""
    soil_lo, soil_hi = clim["soil_root"].quantile(0.33), clim["soil_root"].quantile(0.66)
    rows = []
    for _, r in clim.iterrows():
        m = int(r["month"])
        entry = {
            "month": m,
            "Heat": (level(r["tmax"], 35, 39), f"Avg max {r['tmax']:.1f} °C, {r['hot_days']:.1f} days ≥ {C.HOT_DAY_C:.0f} °C"),
            "Water deficit": (level(-r["water_balance"], 60, 120), f"Rain {r['rain']:.0f} mm vs. evaporative demand {r['et0']:.0f} mm"),
            "Dry soil": (0 if r["soil_root"] >= soil_hi else 1 if r["soil_root"] >= soil_lo else 2,
                         f"Root-zone wetness {r['soil_root']:.2f} (0 = dry, 1 = saturated)"),
            "Heavy rain": (level(r["heavy_rain_days"], 0.3, 0.8), f"{r['heavy_rain_days']:.1f} days/month ≥ {C.HEAVY_RAIN_MM:.0f} mm"),
            "Cold": (level(-r["tmin"], -6, -3), f"Avg min {r['tmin']:.1f} °C"),
        }
        if ndvi_clim is not None and not ndvi_clim.empty:
            nv = ndvi_clim.loc[ndvi_clim["month"] == m, "ndvi"]
            if len(nv):
                v = float(nv.mean())
                entry["Low vegetation"] = (level(v, 0.40, 0.30, reverse=True),
                                           f"MODIS NDVI {v:.2f}")
        rows.append(entry)
    return pd.DataFrame(rows)


def headline_insights(clim, annual, tr) -> list[str]:
    hottest = clim.loc[clim["tmax"].idxmax()]
    wettest = clim.loc[clim["rain"].idxmax()]
    deficit_months = clim.loc[clim["water_balance"] < -60, "month_name"].tolist()
    out = [
        f"**{hottest['month_name']}** is the hottest month: average daily maximum "
        f"**{hottest['tmax']:.1f} °C**, with about **{hottest['hot_days']:.0f} days ≥ {C.HOT_DAY_C:.0f} °C**.",
        f"**{wettest['month_name']}** brings the most rain (**{wettest['rain']:.0f} mm** on average); "
        f"annual rainfall averages **{annual['rain'].mean():.0f} mm**.",
    ]
    if deficit_months:
        out.append("Evaporative demand exceeds rainfall by more than 60 mm in "
                   f"**{', '.join(deficit_months)}**, so crops in those months depend on irrigation.")
    t = tr.get("tmax_mean", {})
    if t and not np.isnan(t.get("per_decade", np.nan)):
        direction = "warmer" if t["per_decade"] > 0 else "cooler"
        out.append(f"Average daily maximum temperature in {t['late_years']} was "
                   f"**{abs(t['late_mean'] - t['early_mean']):.1f} °C {direction}** than in {t['early_years']} "
                   f"(linear trend {t['per_decade']:+.2f} °C per decade).")
    w = tr.get("wheat_heat_days", {})
    if w and not np.isnan(w.get("early_mean", np.nan)):
        out.append(f"Days ≥ 32 °C in March–April (wheat grain-filling period): "
                   f"**{w['early_mean']:.0f}/yr** in {w['early_years']} vs **{w['late_mean']:.0f}/yr** in {w['late_years']}.")
    return out

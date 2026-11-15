"""Short-range vegetation (NDVI) outlook trained on MODIS MOD13Q1.

Model: for lead h = 1, 2, 3 composites (16 / 32 / 48 days) a ridge regression predicts the NDVI *anomaly*
(observed minus the median for that 16-day slot) from
    the last three anomalies, and the expected seasonal change clim(t+h) - clim(t).
The forecast NDVI is climatology(t+h) + predicted anomaly. One model is trained on all preset regions together
(each with its own climatology).

Validation: leave-one-year-out. Climatology and model are re-fitted without the test year, and the model must beat
two baselines: "normal year" (anomaly = 0) and "persistence" (anomaly stays as it is now).
Uncertainty: the 10th-90th percentile of the validation errors for that lead.

It describes greenness of a ~2 x 2 km area. It is not a yield forecast.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

LEADS = (1, 2, 3)
LAGS = 3
RIDGE = 1.0
MAX_GAP_DAYS = 24  # consecutive composites further apart than this break the sequence


def _clim(d: pd.DataFrame) -> pd.Series:
    return d.groupby("slot")["ndvi"].median()


def _samples(d: pd.DataFrame, clim: pd.Series, h: int) -> pd.DataFrame:
    d = d.sort_values("date").reset_index(drop=True)
    c = d["slot"].map(clim)
    a = d["ndvi"] - c
    gap = d["date"].diff().dt.days
    rows = []
    n = len(d)
    for t in range(LAGS - 1, n - h):
        idx = range(t - LAGS + 1, t + h + 1)
        if any(gap.iloc[i] > MAX_GAP_DAYS for i in idx if i > t - LAGS + 1):
            continue
        rows.append({"t_date": d.at[t, "date"], "year": d.at[t + h, "date"].year,
                     "a0": a.iat[t], "a1": a.iat[t - 1], "a2": a.iat[t - 2],
                     "dclim": c.iat[t + h] - c.iat[t], "y": a.iat[t + h], "clim_target": c.iat[t + h],
                     "ndvi_target": d.at[t + h, "ndvi"]})
    return pd.DataFrame(rows)


def _X(s: pd.DataFrame) -> np.ndarray:
    return np.column_stack([s["a0"], s["a1"], s["a2"], s["dclim"], np.ones(len(s))])


def _fit(X: np.ndarray, y: np.ndarray) -> np.ndarray:
    reg = RIDGE * np.eye(X.shape[1])
    reg[-1, -1] = 0.0  # do not shrink the intercept
    return np.linalg.solve(X.T @ X + reg, X.T @ y)


@dataclass
class Outlook:
    region: str
    last_date: pd.Timestamp
    last_ndvi: float
    last_clim: float
    table: pd.DataFrame  # lead, date, ndvi, lo, hi, clim


@dataclass
class Model:
    coefs: dict           # lead -> coefficients
    resid_q: dict         # lead -> (q10, q90) of validation residuals
    skill: pd.DataFrame   # lead, days, mae_model, mae_normal, mae_persist, skill_vs_normal, skill_vs_persist, n
    clims: dict           # region -> climatology series


def train(series: dict[str, pd.DataFrame]) -> Model:
    """series: region id -> cleaned NDVI frame (vegetation_analysis.clean_ndvi)."""
    years = sorted({y for d in series.values() for y in d["year"].unique()})
    rows, coefs, resid_q = [], {}, {}
    for h in LEADS:
        errs = {"m": [], "n": [], "p": []}
        for yr in years:  # leave-one-year-out
            tr, te = [], []
            for d in series.values():
                cl = _clim(d[d["year"] != yr])
                s = _samples(d, cl, h)
                tr.append(s[s["year"] != yr])
                te.append(s[s["year"] == yr])
            tr, te = pd.concat(tr), pd.concat(te)
            if te.empty or len(tr) < 30:
                continue
            b = _fit(_X(tr), tr["y"].to_numpy())
            pred = _X(te) @ b
            errs["m"].append(te["y"].to_numpy() - pred)
            errs["n"].append(te["y"].to_numpy())
            errs["p"].append(te["y"].to_numpy() - te["a0"].to_numpy())
        e = {k: np.concatenate(v) for k, v in errs.items()}
        mae = {k: float(np.mean(np.abs(v))) for k, v in e.items()}
        rows.append({"lead": h, "days": 16 * h, "mae_model": mae["m"], "mae_normal": mae["n"],
                     "mae_persist": mae["p"], "skill_vs_normal": 1 - mae["m"] / mae["n"],
                     "skill_vs_persist": 1 - mae["m"] / mae["p"], "n": len(e["m"])})
        resid_q[h] = (float(np.quantile(e["m"], 0.1)), float(np.quantile(e["m"], 0.9)))
        full = pd.concat([_samples(d, _clim(d), h) for d in series.values()])
        coefs[h] = _fit(_X(full), full["y"].to_numpy())
    return Model(coefs, resid_q, pd.DataFrame(rows), {r: _clim(d) for r, d in series.items()})


def outlook(model: Model, region: str, d: pd.DataFrame) -> Outlook:
    d = d.sort_values("date").reset_index(drop=True)
    clim = model.clims.get(region)
    if clim is None:
        clim = _clim(d)
    a = d["ndvi"] - d["slot"].map(clim)
    t = len(d) - 1
    last = d.iloc[t]
    out = []
    for h in LEADS:
        date = last["date"] + pd.Timedelta(days=16 * h)
        slot = ((date.dayofyear - 1) // 16) + 1
        c_t, c_h = clim.get(last["slot"], np.nan), clim.get(slot, np.nan)
        x = np.array([a.iat[t], a.iat[t - 1], a.iat[t - 2], c_h - c_t, 1.0])
        an = float(x @ model.coefs[h])
        lo, hi = model.resid_q[h]
        out.append({"lead": h, "date": date, "ndvi": c_h + an, "lo": c_h + an + lo, "hi": c_h + an + hi,
                    "clim": c_h, "anomaly": an})
    return Outlook(region, last["date"], float(last["ndvi"]), float(clim.get(last["slot"], np.nan)),
                   pd.DataFrame(out))


def describe(o: Outlook) -> str:
    an = o.table["anomaly"].mean()
    word = "above normal" if an > 0.03 else "below normal" if an < -0.03 else "close to normal"
    return (f"From the latest MODIS image ({o.last_date:%d %b %Y}, NDVI {o.last_ndvi:.2f} vs. normal "
            f"{o.last_clim:.2f}), greenness over the next ~6 weeks is expected to stay **{word}** "
            f"({an:+.2f} on average).")

"""Soil-related rules: texture, salinity (FAO-29 Maas-Hoffman), water storage, soil wetness."""
from __future__ import annotations

import pandas as pd

TEXTURES = ["sandy", "sandy loam", "loam", "silt loam", "clay loam", "silty clay loam", "clay"]

# Readily available water in the root zone (mm) - simplified, documented assumption
BUCKET_MM = {"sandy": 35, "sandy loam": 50, "loam": 70, "silt loam": 75,
             "clay loam": 80, "silty clay loam": 80, "clay": 85}

# Seepage + percolation under puddled rice (mm/day) - documented assumption
RICE_PERCOLATION = {"sandy": 8, "sandy loam": 6, "loam": 4, "silt loam": 3,
                    "clay loam": 2.5, "silty clay loam": 2, "clay": 1.5}

SALINITY_CLASSES = {
    "Not tested": None,
    "Normal (ECe < 4 dS/m)": 2.0,
    "Slightly saline (ECe 4–8 dS/m)": 6.0,
    "Saline (ECe 8–12 dS/m)": 10.0,
    "Strongly saline (> 12 dS/m)": 14.0,
}
ASSUMED_ECE = 2.0


def salinity_yield_potential(ece: float, threshold: float, slope: float) -> float:
    """Relative yield (%) from FAO-29 / Maas & Hoffman (1977): Y = 100 - b (ECe - a)."""
    if ece <= threshold:
        return 100.0
    return max(0.0, 100.0 - slope * (ece - threshold))


def texture_fit(crop: pd.Series, texture: str) -> tuple[float, str]:
    good = str(crop["textures_good"]).split(";")
    ok = str(crop["textures_ok"]).split(";")
    if texture in good:
        return 100.0, "well suited"
    if texture in ok:
        return 70.0, "acceptable"
    return 35.0, "poorly suited"


def soil_moisture_series(daily: pd.DataFrame, smap: pd.DataFrame | None) -> tuple[pd.DataFrame, str]:
    """Prefer SMAP satellite soil moisture when available; otherwise POWER (MERRA-2) wetness."""
    if smap is not None and not smap.empty:
        s = smap.copy()
        s["month"] = s["date"].dt.month
        return s, "NASA SMAP SPL3SMP_E (satellite, ~9 km, surface ~0–5 cm, m³/m³)"
    s = daily[["date", "GWETTOP", "GWETROOT", "month", "year"]].copy()
    return s, "NASA POWER GWETTOP / GWETROOT (MERRA-2 model, ~0.5°, relative wetness 0–1)"

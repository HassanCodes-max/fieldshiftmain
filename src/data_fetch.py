"""Retrieve NASA data and cache it as CSV in data/raw/.

Sources that work without any login:
  * NASA POWER Daily API (MERRA-2 / GEOS based meteorology + soil wetness)
  * MODIS MOD13Q1 v6.1 NDVI via the ORNL DAAC MODIS Web Service

SMAP and GPM IMERG need a NASA Earthdata login; see src/earthdata_fetch.py.
"""
from __future__ import annotations

import datetime as dt
import json
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd
import requests

from . import config as C

HEADERS = {"User-Agent": "FieldShift/1.0 (NASA Space Apps agricultural decision support)"}


def location_key(lat: float, lon: float) -> str:
    return f"{lat:.2f}_{lon:.2f}".replace("-", "m")


# --------------------------------------------------------------------------- POWER
def power_path(lat: float, lon: float) -> Path:
    return C.RAW / f"power_daily_{location_key(lat, lon)}.csv"


def fetch_power_daily(lat: float, lon: float, start: str = C.POWER_START,
                      end: str | None = None, timeout: int = 120) -> tuple[pd.DataFrame, dict]:
    """Request daily NASA POWER data for one point. Returns (dataframe, metadata)."""
    if end is None:
        end = (dt.date.today() - dt.timedelta(days=1)).strftime("%Y%m%d")
    params = {
        "parameters": ",".join(C.POWER_PARAMS),
        "community": "AG",
        "longitude": round(lon, 4),
        "latitude": round(lat, 4),
        "start": start,
        "end": end,
        "format": "JSON",
        "time-standard": "LST",
    }
    r = requests.get(C.POWER_DAILY_URL, params=params, timeout=timeout, headers=HEADERS)
    r.raise_for_status()
    payload = r.json()
    values = payload["properties"]["parameter"]
    df = pd.DataFrame(values)
    df.index = pd.to_datetime(df.index, format="%Y%m%d")
    df.index.name = "date"
    fill = payload.get("header", {}).get("fill_value", C.POWER_FILL)
    df = df.replace(fill, np.nan).replace(C.POWER_FILL, np.nan)
    # trailing days the API returns as fill for every variable are not real data
    df = df.dropna(how="all")
    meta = {
        "source": "NASA POWER Daily API",
        "api_version": payload.get("header", {}).get("api", {}).get("version"),
        "data_sources": payload.get("header", {}).get("sources"),
        "units": {k: v.get("units") for k, v in payload.get("parameters", {}).items()},
        "longnames": {k: v.get("longname") for k, v in payload.get("parameters", {}).items()},
        "elevation_m": payload.get("geometry", {}).get("coordinates", [None, None, None])[2],
        "lat": lat, "lon": lon,
        "requested": [start, end],
        "retrieved_utc": dt.datetime.utcnow().isoformat(timespec="seconds"),
    }
    return df.reset_index(), meta


def load_power(lat: float, lon: float, refresh: bool = False) -> tuple[pd.DataFrame, dict]:
    path = power_path(lat, lon)
    meta_path = path.with_suffix(".json")
    if path.exists() and not refresh:
        df = pd.read_csv(path, parse_dates=["date"])
        meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
        return df, meta
    df, meta = fetch_power_daily(lat, lon)
    df.to_csv(path, index=False)
    meta_path.write_text(json.dumps(meta, indent=2))
    return df, meta


# --------------------------------------------------------------------------- MODIS NDVI
def ndvi_path(lat: float, lon: float) -> Path:
    return C.RAW / f"modis_ndvi_{location_key(lat, lon)}.csv"


def _ornl_get(path: str, params: dict, timeout: int = 120, retries: int = 5) -> dict:
    last = None
    for attempt in range(retries):
        try:
            r = requests.get(f"{C.ORNL_URL}/{path}", params=params, timeout=timeout,
                             headers={**HEADERS, "Accept": "application/json"})
            r.raise_for_status()
            return r.json()
        except (requests.ConnectionError, requests.Timeout, requests.HTTPError) as e:
            last = e
            time.sleep(2 * (attempt + 1))
    raise last


def _modis_dates(lat: float, lon: float, start_year: int) -> list[str]:
    js = _ornl_get(f"{C.MODIS_PRODUCT}/dates", {"latitude": lat, "longitude": lon})
    return [d["modis_date"] for d in js["dates"] if int(d["modis_date"][1:5]) >= start_year]


def _modis_chunk(lat, lon, band, dates):
    js = _ornl_get(f"{C.MODIS_PRODUCT}/subset", {
        "latitude": lat, "longitude": lon, "band": band,
        "startDate": dates[0], "endDate": dates[-1],
        "kmAboveBelow": C.NDVI_KM, "kmLeftRight": C.NDVI_KM,
    })
    return [(s["calendar_date"], s["data"]) for s in js.get("subset", [])]


def fetch_modis_ndvi(lat: float, lon: float, start_year: int = C.NDVI_START_YEAR,
                     progress=None) -> pd.DataFrame:
    """NDVI time series (median of good-quality pixels in a ~2 x 2 km window)."""
    dates = _modis_dates(lat, lon, start_year)
    chunks = [dates[i:i + 10] for i in range(0, len(dates), 10)]  # API limit: 10 dates
    jobs = [(b, ch) for ch in chunks for b in (C.NDVI_BAND, C.RELIABILITY_BAND)]
    results: dict[tuple, list] = {}
    done = 0
    with ThreadPoolExecutor(max_workers=2) as ex:
        futs = {ex.submit(_modis_chunk, lat, lon, b, ch): (b, i)
                for i, (b, ch) in enumerate(jobs)}
        for f, key in futs.items():
            results[key] = f.result()
            done += 1
            if progress:
                progress(done / len(jobs))
    ndvi, rel = {}, {}
    for (band, _), rows in results.items():
        target = ndvi if band == C.NDVI_BAND else rel
        for date, data in rows:
            target[date] = np.array(data, dtype=float)
    records = []
    for date in sorted(ndvi):
        v = ndvi[date]
        q = rel.get(date)
        valid = (v > -2000) & (v <= 10000)
        good = valid & (np.isin(q, [0, 1]) if q is not None else True)
        use = v[good] if good.sum() >= 5 else v[valid]
        records.append({
            "date": pd.Timestamp(date),
            "ndvi": float(np.median(use)) * 1e-4 if use.size else np.nan,
            "ndvi_p25": float(np.percentile(use, 25)) * 1e-4 if use.size else np.nan,
            "ndvi_p75": float(np.percentile(use, 75)) * 1e-4 if use.size else np.nan,
            "good_pixel_fraction": float(good.mean()),
            "n_pixels": int(v.size),
        })
    return pd.DataFrame(records)


def load_ndvi(lat: float, lon: float, refresh: bool = False, progress=None) -> pd.DataFrame:
    path = ndvi_path(lat, lon)
    if path.exists() and not refresh:
        return pd.read_csv(path, parse_dates=["date"])
    df = fetch_modis_ndvi(lat, lon, progress=progress)
    df.to_csv(path, index=False)
    return df


def check_landcover(lat: float, lon: float, year: int = 2022) -> dict:
    """MODIS MCD12Q1 IGBP class of the centre pixel (12 = croplands, 14 = cropland mosaic)."""
    js = _ornl_get("MCD12Q1/subset", {
        "latitude": lat, "longitude": lon, "band": "LC_Type1",
        "startDate": f"A{year}001", "endDate": f"A{year}001",
        "kmAboveBelow": 1, "kmLeftRight": 1,
    })
    data = np.array(js["subset"][0]["data"])
    centre = int(data[len(data) // 2])
    return {"centre_class": centre,
            "cropland_fraction": float(np.isin(data, [12, 14]).mean()),
            "is_cropland": centre in (12, 14)}


# --------------------------------------------------------------------------- SMAP (optional)
def smap_path(lat: float, lon: float) -> Path:
    return C.RAW / f"smap_{location_key(lat, lon)}.csv"


def smap_from_appeears(df: pd.DataFrame) -> pd.DataFrame:
    """Turn an AppEEARS SPL3SMP_E point-results table into date, soil_moisture, n_overpasses.

    Fill values (-9999) are dropped; AM and PM overpasses are averaged (m³/m³).
    `recommended` is True when at least one overpass that day had SMAP's recommended-quality flag (bit 0 = 0).
    """
    import re
    sm_cols = [c for c in df.columns if re.search(r"soil_moisture(_pm)?$", c)]
    qf_cols = [c for c in df.columns if re.search(r"retrieval_qual_flag(_pm)?$", c)]
    vals = df[sm_cols].where((df[sm_cols] >= 0) & (df[sm_cols] <= 1))
    out = pd.DataFrame({"date": pd.to_datetime(df["Date"]),
                        "soil_moisture": vals.mean(axis=1),
                        "n_overpasses": vals.notna().sum(axis=1)})
    if qf_cols:
        good = pd.concat([(df[q].fillna(1).astype(int) & 1).eq(0) & vals.iloc[:, i].notna()
                          for i, q in enumerate(qf_cols[:len(sm_cols)])], axis=1)
        out["recommended"] = good.any(axis=1)
    out = out.dropna(subset=["soil_moisture"])
    return out.groupby("date", as_index=False).agg(
        {c: ("mean" if c == "soil_moisture" else "max") for c in out.columns if c != "date"})


def load_smap_if_available(lat: float, lon: float) -> pd.DataFrame | None:
    path = smap_path(lat, lon)
    if path.exists():
        return pd.read_csv(path, parse_dates=["date"])
    return None

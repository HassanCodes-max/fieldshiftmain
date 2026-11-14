"""Shared Streamlit helpers: state, styling, cached data and evaluations."""
from __future__ import annotations

import json
from dataclasses import dataclass

import pandas as pd
import streamlit as st

from . import climate_analysis as CA
from . import config as C
from . import data_fetch as F
from . import preprocessing as P
from . import rotation_engine as R
from . import vegetation_analysis as V
from . import visualization as VIZ

DEFAULT_WEIGHTS = {"water": 5, "soil": 3, "climate": 2, "soilfit": 2, "calendar": 2, "market": 2}

CSS = """
<style>
:root { --fs-green:#2f6b2f; --fs-soil:#7a5230; --fs-ink:#1c1c1a; --fs-muted:#5f5e59; --fs-card:#ffffff;
        --fs-line:#e6e4dc; --fs-cream:#f7f5ee; }
.block-container { padding-top: 2rem; max-width: 1200px; }
h1, h2, h3 { letter-spacing: -0.01em; }
.fs-hero { background: linear-gradient(120deg, #1f4d2b 0%, #2f6b2f 45%, #8a6d2f 100%); color: #fff;
           border-radius: 18px; padding: 2.2rem 2rem; margin-bottom: 1.2rem; }
.fs-hero h1 { color:#fff; margin:0 0 .4rem 0; font-size: 2.4rem; }
.fs-hero p { color:#f1efe6; font-size: 1.1rem; margin: 0; max-width: 46rem; }
.fs-hero .tag { display:inline-block; background: rgba(255,255,255,.16); border-radius: 999px;
                padding: .2rem .7rem; font-size: .8rem; margin-right: .35rem; margin-bottom: .8rem; }
.fs-card { background: var(--fs-card); border: 1px solid var(--fs-line); border-radius: 14px;
           padding: 1rem 1.1rem; height: 100%; }
.fs-card h4 { margin: 0 0 .3rem 0; font-size: 1.02rem; color: var(--fs-ink); }
.fs-card p { margin: 0; color: var(--fs-muted); font-size: .93rem; }
.fs-step { font-size: 1.6rem; }
.fs-kpi { background: var(--fs-cream); border-radius: 12px; padding: .8rem 1rem; }
.fs-kpi .v { font-size: 1.6rem; font-weight: 700; color: var(--fs-ink); line-height: 1.1; }
.fs-kpi .l { font-size: .82rem; color: var(--fs-muted); }
.fs-pill { display:inline-block; border-radius:999px; padding:.15rem .65rem; font-size:.8rem; font-weight:600;
           margin-right:.3rem; }
.fs-good { background:#e3f3e3; color:#185c18; } .fs-warn { background:#fff1cc; color:#7a5300; }
.fs-bad { background:#fbe1e1; color:#8f2222; } .fs-info { background:#e3eefb; color:#174b8a; }
.fs-rank { background: var(--fs-card); border: 1px solid var(--fs-line); border-left: 6px solid var(--c);
           border-radius: 14px; padding: 1rem 1.2rem; margin-bottom: .8rem; }
.fs-rank .score { font-size: 2rem; font-weight: 800; color: var(--fs-ink); }
.fs-source { font-size: .8rem; color: var(--fs-muted); }
.fs-note { background:#f3f7ef; border-left:4px solid var(--fs-green); padding:.7rem 1rem; border-radius:8px;
           color:#2b3a26; font-size:.93rem; }
</style>
"""


def inject_css():
    st.markdown(CSS, unsafe_allow_html=True)


def default_profile() -> dict:
    reg = R.load_regions().iloc[0]
    return {
        "region_id": reg["region_id"], "place": reg["name"], "lat": float(reg["lat"]), "lon": float(reg["lon"]),
        "zone": reg["zone"],
        "farmer_name": "", "farm_area_acres": 12.5, "soil_texture": "loam", "salinity_class": "Not tested",
        "ece": None, "waterlogging": False, "irrigation": "Canal + tubewell", "water_availability": "Moderate",
        "burns_residue": True, "current_rotation": "rw",
        "market": {"rice": "Yes", "wheat": "Yes", "maize": "Yes", "mungbean": "Unknown", "cotton": "Yes"},
        "weights": dict(DEFAULT_WEIGHTS),
    }


def init_state():
    if "profile" not in st.session_state:
        st.session_state.profile = default_profile()
    if "compare" not in st.session_state:
        st.session_state.compare = ["rw", "rwm", "mw"]
    if "custom_rotations" not in st.session_state:
        st.session_state.custom_rotations = {}
    if "scenario" not in st.session_state:
        st.session_state.scenario = {"temp": 0.0, "rain": 0}


def all_rotations() -> dict[str, list[str]]:
    rots = {r["rotation_id"]: r["crops"].split(";") for _, r in R.load_rotations().iterrows()}
    rots.update(st.session_state.get("custom_rotations", {}))
    return rots


@st.cache_data(show_spinner=False)
def crops_df() -> pd.DataFrame:
    return R.load_crops()


def rotation_name(rid: str) -> str:
    return R.rotation_label(all_rotations()[rid], crops_df())


def rotation_colors() -> dict[str, str]:
    """Stable colour per rotation id -> label, independent of which are selected."""
    ids = list(all_rotations().keys())
    return {rotation_name(r): VIZ.rotation_color(i) for i, r in enumerate(ids)}


# --------------------------------------------------------------------------- data
def ensure_data(lat: float, lon: float) -> dict:
    """Make sure raw NASA files exist locally, fetching with visible progress if needed."""
    status = {"power": F.power_path(lat, lon).exists(), "ndvi": F.ndvi_path(lat, lon).exists(),
              "smap": F.smap_path(lat, lon).exists(), "errors": []}
    if not status["power"]:
        with st.status("🛰️ Downloading 25 years of daily weather from NASA POWER…", expanded=False) as s:
            try:
                F.load_power(lat, lon)
                status["power"] = True
                s.update(label="NASA POWER data downloaded", state="complete")
            except Exception as e:  # noqa: BLE001
                status["errors"].append(f"NASA POWER: {e}")
                s.update(label="NASA POWER download failed", state="error")
    if not status["ndvi"] and not st.session_state.get(f"skip_ndvi_{lat}_{lon}"):
        st.info("MODIS vegetation (NDVI) for this location is not downloaded yet. It takes 1–3 minutes.")
        c1, c2 = st.columns([1, 3])
        if c1.button("🌿 Download MODIS NDVI", key=f"ndvi_btn_{lat}_{lon}"):
            bar = st.progress(0.0, text="Requesting MODIS MOD13Q1 from ORNL DAAC…")
            try:
                F.load_ndvi(lat, lon, progress=lambda p: bar.progress(p, text=f"MODIS NDVI {p:.0%}"))
                status["ndvi"] = True
                st.rerun()
            except Exception as e:  # noqa: BLE001
                status["errors"].append(f"MODIS NDVI: {e}")
        if c2.button("Continue without NDVI", key=f"ndvi_skip_{lat}_{lon}"):
            st.session_state[f"skip_ndvi_{lat}_{lon}"] = True
            st.rerun()
    for err in status["errors"]:
        st.error(err)
    return status


@dataclass
class Bundle:
    daily: pd.DataFrame
    monthly: pd.DataFrame
    clim: pd.DataFrame
    annual: pd.DataFrame
    trends: dict
    years: list
    all_years: list
    quality: dict
    meta: dict
    ndvi: pd.DataFrame | None
    ndvi_clim: pd.DataFrame | None
    ndvi_windows: list
    ndvi_threshold: float | None
    ndvi_peaks: pd.DataFrame | None
    stress: pd.DataFrame
    smap: pd.DataFrame | None


@st.cache_data(show_spinner="Processing NASA data…")
def load_bundle(lat: float, lon: float, temp: float = 0.0, rain_pct: int = 0, _v: int = 2) -> Bundle | None:
    if not F.power_path(lat, lon).exists():
        return None
    raw, meta = F.load_power(lat, lon)
    daily = P.clean_power(raw, lat, temp_offset=temp, rain_factor=1 + rain_pct / 100)
    monthly = P.to_monthly(daily)
    all_years = P.complete_years(daily)
    years = CA.recent_years(all_years)
    clim = CA.climatology(monthly, years)
    annual = CA.annual_summary(daily, all_years)
    tr = CA.trends(annual)
    nd = nclim = peaks = None
    windows, thr = [], None
    if F.ndvi_path(lat, lon).exists():
        nd = V.clean_ndvi(F.load_ndvi(lat, lon))
        nclim = V.ndvi_climatology(nd)
        windows, thr = V.low_vegetation_windows(nclim)
        peaks = V.seasonal_peaks(nd)
    stress = CA.stress_matrix(clim, nclim)
    return Bundle(daily, monthly, clim, annual, tr, years, all_years, P.data_quality(raw, daily), meta,
                  nd, nclim, windows, thr, peaks, stress, F.load_smap_if_available(lat, lon))


def current_bundle(show_fetch: bool = True) -> tuple[Bundle | None, dict]:
    p = st.session_state.profile
    sc = st.session_state.scenario
    status = ensure_data(p["lat"], p["lon"]) if show_fetch else {}
    return load_bundle(p["lat"], p["lon"], sc["temp"], sc["rain"]), status


@st.cache_data(show_spinner="Running the rotation engine on NASA data…")
def _evaluate(crop_key: str, profile_json: str, lat: float, lon: float, temp: float, rain_pct: int):
    b = load_bundle(lat, lon, temp, rain_pct)
    profile = json.loads(profile_json)
    low = V.window_doys(b.ndvi_windows) if b.ndvi_windows else None
    status = {"ndvi": b.ndvi is not None, "smap": b.smap is not None}
    return R.evaluate_rotation(crop_key.split(";"), profile, b.daily, crops_df(), low, status)


def evaluations(rotation_ids: list[str]) -> tuple[list, object]:
    """Evaluate the requested rotations plus the farmer's current one. Returns (evals, current)."""
    p = st.session_state.profile
    sc = st.session_state.scenario
    rots = all_rotations()
    pj = json.dumps({k: v for k, v in p.items() if k not in ("farmer_name",)}, sort_keys=True, default=str)
    ids = list(dict.fromkeys([p["current_rotation"]] + list(rotation_ids)))
    evals = [_evaluate(";".join(rots[i]), pj, p["lat"], p["lon"], sc["temp"], sc["rain"]) for i in ids if i in rots]
    # copy so comparison text does not mutate cached objects
    import copy
    evals = [copy.deepcopy(e) for e in evals]
    current = evals[0]
    R.compare(evals, current)
    return evals, current


# --------------------------------------------------------------------------- small widgets
def kpi(col, value: str, label: str):
    col.markdown(f"<div class='fs-kpi'><div class='v'>{value}</div><div class='l'>{label}</div></div>",
                 unsafe_allow_html=True)


def card(col, icon: str, title: str, body: str):
    col.markdown(f"<div class='fs-card'><div class='fs-step'>{icon}</div><h4>{title}</h4><p>{body}</p></div>",
                 unsafe_allow_html=True)


def pill(text: str, kind: str = "info") -> str:
    return f"<span class='fs-pill fs-{kind}'>{text}</span>"


def farm_banner():
    p = st.session_state.profile
    sc = st.session_state.scenario
    rot = rotation_name(p["current_rotation"])
    extra = ""
    if sc["temp"] or sc["rain"]:
        extra = pill(f"What-if: {sc['temp']:+.1f} °C, {sc['rain']:+d}% rain", "warn")
    coords = "{:.2f}°N, {:.2f}°E".format(p["lat"], p["lon"])
    water = "💧 " + p["irrigation"] + " · " + p["water_availability"]
    st.markdown(
        pill("📍 " + p["place"], "info") + pill(coords, "info") + pill("🌱 " + p["soil_texture"], "good")
        + pill(water, "good") + pill("🔄 Now: " + rot, "good") + extra, unsafe_allow_html=True)


def no_data_stop():
    st.warning("NASA data for this location is not available yet. Check your internet connection "
               "and open this page again, or pick a preset region on **My Farm**.")
    st.stop()

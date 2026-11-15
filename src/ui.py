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
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
:root { --fs-forest:#163D2B; --fs-green:#2F754B; --fs-sage:#E7F0E8; --fs-bg:#F8FAF6; --fs-ink:#202A24;
        --fs-muted:#758078; --fs-card:#FFFFFF; --fs-line:#E1E8E2; --fs-gold:#B8892B; --fs-gold-bg:#FBF3E1;
        --fs-shadow:0 1px 2px rgba(22,61,43,.06), 0 4px 14px rgba(22,61,43,.06); }
html, body, [class*="css"], .stMarkdown, button, input, textarea, select { font-family: 'Inter', sans-serif; }
.block-container { padding-top: 1.6rem; max-width: 1240px; }
h1 { font-weight: 800; letter-spacing: -0.02em; color: var(--fs-forest); }
h2, h3, h4 { letter-spacing: -0.01em; color: var(--fs-ink); font-weight: 700; }
[data-testid="stSidebar"] { background: var(--fs-sage); border-right: 1px solid var(--fs-line); }
[data-testid="stSidebarNav"] a span { font-weight: 500; }
[data-testid="stMetric"] { background: var(--fs-card); border: 1px solid var(--fs-line); border-radius: 14px;
                          padding: .8rem 1rem; box-shadow: var(--fs-shadow); }
.stTabs [data-baseweb="tab-list"] { gap: .25rem; }
.stTabs [data-baseweb="tab"] { border-radius: 10px 10px 0 0; padding: .45rem .9rem; }
div[data-testid="stExpander"] { border-radius: 12px; border-color: var(--fs-line); }
.stButton > button, .stDownloadButton > button { border-radius: 10px; font-weight: 600; }

.fs-hero { background: var(--fs-forest); color: #fff; border-radius: 18px; padding: 2rem 2.1rem;
           margin-bottom: 1.2rem; position: relative; overflow: hidden; }
.fs-hero:after { content:""; position:absolute; right:-80px; top:-80px; width:320px; height:320px; border-radius:50%;
                 background: radial-gradient(circle, rgba(47,117,75,.55), rgba(47,117,75,0) 70%); }
.fs-hero h1 { color:#fff; margin:0 0 .5rem 0; font-size: 2.3rem; line-height: 1.15; }
.fs-hero p { color:#D8E6DB; font-size: 1.05rem; margin: 0; max-width: 46rem; position: relative; z-index: 1; }
.fs-hero .tag { display:inline-block; background: rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.18);
                border-radius: 999px; padding: .2rem .7rem; font-size: .78rem; margin: 0 .35rem .8rem 0; }
.fs-card { background: var(--fs-card); border: 1px solid var(--fs-line); border-radius: 16px;
           padding: 1rem 1.15rem; height: 100%; box-shadow: var(--fs-shadow); }
.fs-card h4 { margin: .2rem 0 .3rem 0; font-size: 1rem; color: var(--fs-ink); }
.fs-card p { margin: 0; color: var(--fs-muted); font-size: .9rem; line-height: 1.45; }
.fs-step { font-size: 1.4rem; }
.fs-kpi { background: var(--fs-card); border: 1px solid var(--fs-line); border-radius: 16px; padding: .9rem 1.05rem;
          box-shadow: var(--fs-shadow); height: 100%; }
.fs-kpi .t { font-size: .74rem; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--fs-muted); }
.fs-kpi .v { font-size: 1.65rem; font-weight: 800; color: var(--fs-forest); line-height: 1.15; margin: .15rem 0; }
.fs-kpi .l { font-size: .82rem; color: var(--fs-muted); }
.fs-pill { display:inline-block; border-radius:999px; padding:.14rem .62rem; font-size:.76rem; font-weight:600;
           margin: 0 .3rem .25rem 0; }
.fs-good { background:#E3F1E6; color:#1F5E36; } .fs-warn { background:var(--fs-gold-bg); color:#7A5A12; }
.fs-bad { background:#F8E3E1; color:#8F2A22; } .fs-info { background:#E6EEF0; color:#2D4A55; }
.fs-plan { background:#EEF0EE; color:#5B655E; }
.fs-rank { background: var(--fs-card); border: 1px solid var(--fs-line); border-left: 6px solid var(--c);
           border-radius: 16px; padding: 1rem 1.2rem; margin-bottom: .8rem; box-shadow: var(--fs-shadow); }
.fs-rank .score { font-size: 2rem; font-weight: 800; color: var(--fs-forest); }
.fs-source { font-size: .78rem; color: var(--fs-muted); }
.fs-note { background: var(--fs-sage); border-left:4px solid var(--fs-green); padding:.75rem 1rem; border-radius:10px;
           color: var(--fs-ink); font-size:.9rem; }
.fs-insight { background: var(--fs-gold-bg); border-left:4px solid var(--fs-gold); padding:.75rem 1rem;
              border-radius:10px; color: var(--fs-ink); font-size:.93rem; }
.fs-steps { display:flex; flex-direction:column; gap:.3rem; margin:.2rem 0 .6rem 0; }
.fs-steps .s { font-size:.84rem; color: var(--fs-muted); }
.fs-steps .s b { display:inline-block; width:1.35rem; height:1.35rem; line-height:1.35rem; text-align:center;
                 border-radius:50%; background:#fff; border:1px solid var(--fs-line); margin-right:.45rem;
                 font-size:.72rem; color: var(--fs-forest); }
.fs-steps .s.on { color: var(--fs-forest); font-weight: 600; }
.fs-steps .s.on b { background: var(--fs-green); color:#fff; border-color: var(--fs-green); }
@media (max-width: 640px) { .fs-hero { padding: 1.4rem 1.2rem; } .fs-hero h1 { font-size: 1.7rem; } }
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
def kpi(col, value: str, label: str, title: str = "", badge: str = ""):
    t = f"<div class='t'>{title}</div>" if title else ""
    col.markdown(f"<div class='fs-kpi'>{t}<div class='v'>{value}</div><div class='l'>{label}</div>{badge}</div>",
                 unsafe_allow_html=True)


# Data provenance badges: every number on screen is one of these.
PROVENANCE = {
    "observed": ("Observed", "good"), "modelled": ("Model / reanalysis", "info"),
    "estimated": ("Estimated", "warn"), "farmer": ("Farmer-entered", "info"),
    "forecast": ("Forecast", "warn"), "planned": ("Planned", "plan"), "missing": ("Not available", "bad"),
}


def badge(kind: str, text: str | None = None) -> str:
    label, css = PROVENANCE[kind]
    return pill(text or label, css)


STEPS = [("views/1_Farm_Profile.py", "Select your farm"), ("views/1_Farm_Profile.py", "Enter your conditions"),
         ("views/2_NASA_Insights.py", "Analyse NASA data"), ("views/4_Rotation_Comparison.py", "Compare rotations"),
         ("views/5_Recommendations.py", "Review recommendations")]


def step_tracker(active: int | None):
    html = "".join(f"<div class='s{' on' if active is not None and i <= active else ''}'><b>{i + 1}</b>{t}</div>"
                   for i, (_, t) in enumerate(STEPS))
    st.markdown(f"<div class='fs-steps'>{html}</div>", unsafe_allow_html=True)


@st.cache_resource(show_spinner="Training the NDVI outlook model on MODIS data…")
def ndvi_model(_v: int = 1):
    """Train once per server on all preset regions that have MODIS NDVI cached."""
    from . import ndvi_forecast as N
    series = {}
    for r in R.load_regions().itertuples():
        if F.ndvi_path(r.lat, r.lon).exists():
            series[r.region_id] = V.clean_ndvi(F.load_ndvi(r.lat, r.lon))
    return N.train(series) if len(series) >= 2 else None


CROP_SHORT = {"rice": "Rice", "wheat": "Wheat", "maize": "Maize", "mungbean": "Mungbean", "cotton": "Cotton"}


@st.cache_data(show_spinner=False)
def srtm(lat: float, lon: float) -> dict | None:
    try:
        return F.load_srtm(lat, lon)
    except Exception:  # offline or service down: show "unknown slope" instead of failing
        return None


def soil_profile(e) -> dict:
    """Soil-health profile (pest cycle, erosion, forage, crop roles) for one Evaluation."""
    from . import soil_health as SH
    p = st.session_state.profile
    s = srtm(p["lat"], p["lon"])
    return SH.profile(e.crop_ids, e.schedule.bare_days, p["soil_texture"], p["burns_residue"],
                      s["slope_pct"] if s else None, SH.load_traits(), CROP_SHORT)


@st.cache_data(show_spinner="Building the district trend map…")
def district_years() -> pd.DataFrame:
    """Yearly indicators for every preset district (for the trend-over-time map)."""
    rows = []
    for r in R.load_regions().itertuples():
        b = load_bundle(float(r.lat), float(r.lon))
        if b is None:
            continue
        a = b.annual.copy()
        if b.ndvi is not None:
            a = a.merge(b.ndvi.groupby("year")["ndvi"].max().rename("ndvi_peak"), left_on="year",
                        right_index=True, how="left")
        if b.smap is not None:
            sm = b.smap.groupby(b.smap["date"].dt.year)["soil_moisture"].mean().rename("smap_mean")
            a = a.merge(sm, left_on="year", right_index=True, how="left")
        a["district"] = r.name.replace(" (rural)", "")
        a["lat"], a["lon"] = float(r.lat), float(r.lon)
        rows.append(a)
    return pd.concat(rows, ignore_index=True)


@st.cache_data(ttl=3600)
def amis_prices() -> pd.DataFrame | None:
    import glob
    files = sorted(glob.glob(str(C.RAW / "amis" / "amis_prices_*.csv")))
    if not files:
        return None
    d = pd.concat([pd.read_csv(f) for f in files], ignore_index=True)
    d["date"] = pd.to_datetime(d["date"])
    return d.drop_duplicates(["commodity", "market", "date"])


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

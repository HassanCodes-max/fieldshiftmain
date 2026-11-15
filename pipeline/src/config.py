"""Central paths and constants for Field Shift."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RAW = DATA / "raw"
PROCESSED = DATA / "processed"
KNOWLEDGE = DATA / "crop_knowledge"
AGRI = DATA / "agriculture"

for _p in (RAW, PROCESSED, AGRI):
    _p.mkdir(parents=True, exist_ok=True)

# NASA POWER
POWER_DAILY_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
POWER_PARAMS = [
    "T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "RH2M",
    "GWETTOP", "GWETROOT", "ALLSKY_SFC_SW_DWN", "WS2M",
]
POWER_START = "20010101"
POWER_FILL = -999.0

# MODIS MOD13Q1 via ORNL DAAC MODIS Web Service (no login required)
ORNL_URL = "https://modis.ornl.gov/rst/api/v1"
MODIS_PRODUCT = "MOD13Q1"
NDVI_BAND = "250m_16_days_NDVI"
RELIABILITY_BAND = "250m_16_days_pixel_reliability"
NDVI_START_YEAR = 2015
NDVI_KM = 1  # 1 km above/below/left/right -> ~2 x 2 km window (9 x 9 pixels)
LANDCOVER_YEAR = 2023  # latest MODIS MCD12Q1 (500 m, yearly) year available at ORNL DAAC

# GPM IMERG Final monthly (V07) via NASA GES DISC OPeNDAP (needs a free Earthdata login)
IMERG_HOSTS = ("https://gpm1.gesdisc.eosdis.nasa.gov", "https://gpm2.gesdisc.eosdis.nasa.gov")  # mirrors
IMERG_OPENDAP = IMERG_HOSTS[0] + "/opendap/GPM_L3/GPM_3IMERGM.07"
IMERG_PATH = "/opendap/GPM_L3/GPM_3IMERGM.07"
IMERG_FILE = "3B-MO.MS.MRG.3IMERG.{y:04d}{m:02d}01-S000000-E235959.{m:02d}.{ver}.HDF5"
IMERG_VERSIONS = ("V07B", "V07A")   # newest first; GES DISC replaces files when a sub-version is released
IMERG_RES = 0.1                     # degrees; grid starts at -180 E / -90 N, dims [time][lon][lat]
IMERG_START_YEAR = 2001             # aligned with the NASA POWER record used by the app
IMERG_FILL = -9999.9
RAIN_BIAS_WARN_PCT = 25.0           # |POWER - IMERG| / IMERG above this is reported as a data gap

# Analysis
BASELINE_YEARS = 10          # most recent complete years used for crop scoring
HOT_DAY_C = 40.0             # "very hot day" threshold used in seasonal analysis
HEAVY_RAIN_MM = 40.0         # heavy rain day threshold (mm/day)
IRRIGATION_DEPTH_MM = 75.0   # one farmer irrigation ~ 3 inches
TURNAROUND_DAYS = 7          # days between harvest and next sowing
MAX_LATE_DAYS = 30           # sowing later than window end by more than this = infeasible

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

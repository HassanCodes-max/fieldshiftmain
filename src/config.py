"""Central paths and constants for Field Shift."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RAW = DATA / "raw"
KNOWLEDGE = DATA / "crop_knowledge"

RAW.mkdir(parents=True, exist_ok=True)

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

# Analysis
BASELINE_YEARS = 10          # most recent complete years used for crop scoring
HOT_DAY_C = 40.0             # "very hot day" threshold used in seasonal analysis
HEAVY_RAIN_MM = 40.0         # heavy rain day threshold (mm/day)
IRRIGATION_DEPTH_MM = 75.0   # one farmer irrigation ~ 3 inches
TURNAROUND_DAYS = 7          # days between harvest and next sowing
MAX_LATE_DAYS = 30           # sowing later than window end by more than this = infeasible

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

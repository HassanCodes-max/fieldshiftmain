import pandas as pd
import streamlit as st

from src import config as C
from src import rotation_engine as R
from src import soil_analysis as S
from src import ui

ui.init_state()
ui.inject_css()
st.title("📚 Data & Methods")
st.caption("Everything Field Shift uses, how it is combined, and what it cannot tell you.")

t1, t2, t3, t4, t5 = st.tabs(["🛰️ NASA data", "🌾 Agricultural knowledge", "🧮 How scores work",
                              "⚠️ Limitations", "🔑 Adding SMAP & GPM"])

with t1:
    st.markdown("""
| Dataset | Variables used | Resolution | Period | Access | Status |
|---|---|---|---|---|---|
| **NASA POWER** Daily (v2.x) | `T2M`, `T2M_MAX`, `T2M_MIN`, `PRECTOTCORR`, `RH2M`, `GWETTOP`, `GWETROOT`, `ALLSKY_SFC_SW_DWN`, `WS2M` | ~0.5° × 0.625° (MERRA-2) | 2001 → yesterday | REST API, no login | ✅ live |
| **MODIS MOD13Q1 v6.1** | NDVI + pixel reliability | 250 m, 16-day | 2015 → latest | ORNL DAAC MODIS Web Service, no login | ✅ live |
| **MODIS MCD12Q1** | IGBP land cover (cropland check of preset points) | 500 m, yearly | 2022 | ORNL DAAC | ✅ used to verify presets |
| **SMAP SPL3SMP_E v6** | Surface soil moisture | 9 km, daily | 2015 → | Earthdata login (AppEEARS) | ✅ all 6 preset regions loaded |
| **GPM IMERG** (Final, monthly) | Precipitation | 0.1° | 2000 → | Earthdata login | 🔑 planned cross-check |
""")
    st.markdown("""
**How the datasets are aligned**
- *Space*: every dataset is sampled at the farm coordinate. POWER returns the grid cell containing it; MODIS NDVI is the
  **median of good-quality pixels in a ~2 × 2 km window** (pixel reliability 0–1), which reduces cloud and field-edge noise.
  Original resolutions are kept and shown — combining them does **not** create field-level accuracy.
- *Time*: daily POWER values drive the crop simulations; monthly and seasonal (Winter, Spring, Pre-monsoon, Monsoon,
  Post-monsoon) aggregates drive the stress calendar; NDVI is aligned by 16-day composite period across years.
- *Missing data*: POWER fill value −999 → missing; gaps ≤ 3 days are interpolated, longer gaps are excluded; crop seasons
  with any missing day are dropped from the simulation.
""")

with t2:
    crops = ui.crops_df()
    st.markdown("Crop parameters used by the engine (`data/crop_knowledge/crops.csv`). Every row lists its source and "
                "what still needs local verification.")
    show = crops[["name", "season", "sow_start", "sow_end", "duration_days", "kc_ini", "kc_mid", "kc_end",
                  "heat_threshold_c", "heat_stage", "ece_threshold", "ece_slope", "legume", "verification"]]
    st.dataframe(show.set_index("name"), width="stretch")
    st.markdown("""
**Sources prioritised:** Punjab Agriculture Department (crop calendars, crop estimates, Soil Survey of Punjab),
Ayub Agricultural Research Institute, PARC, FAO Irrigation & Drainage Paper 56 (crop coefficients),
FAO Paper 29 / Maas & Hoffman 1977 (salinity tolerance), and peer-reviewed heat-stress literature.

District statistics (Pakistan Bureau of Statistics / Punjab Crop Reporting Service) describe the *region*; farm
answers on **My Farm** describe *your* field. Field Shift never treats one as the other.
""")
    st.markdown("**Soil assumptions**")
    st.dataframe(pd.DataFrame({"Readily available water (mm)": S.BUCKET_MM,
                               "Rice seepage + percolation (mm/day)": S.RICE_PERCOLATION}), width="stretch")

with t3:
    st.markdown("#### 1 · Crop water need (per crop, per year)")
    st.latex(r"ET_0 = 0.0023\,(T_{mean}+17.8)\,\sqrt{T_{max}-T_{min}}\;R_a \quad\text{(FAO-56 Hargreaves)}")
    st.latex(r"ET_c = K_c(t)\cdot ET_0 \quad\text{(FAO-56 four-stage } K_c \text{ curve)}")
    st.markdown("""
A daily soil-water bucket (size set by your soil type) receives NASA rainfall and loses crop water use; when it empties,
an irrigation refills it. Rice adds land preparation (puddling) and daily seepage/percolation. The total of irrigations
is the **net irrigation need**, simulated separately for each of the last 10 years of observed weather.
""")
    st.markdown("#### 2 · Factor scores (0–100)")
    st.markdown(f"""
| Factor | Calculation |
|---|---|
| 💧 Water saving | `100 × (1 − net irrigation / {R.WATER_SCORE_MAX_MM} mm)`, minus up to 40 if need exceeds your water supply (Reliable {R.WATER_SUPPLY_MM['Reliable']}, Moderate {R.WATER_SUPPLY_MM['Moderate']}, Limited {R.WATER_SUPPLY_MM['Limited']} mm/yr; Rainfed 0) |
| 🌱 Soil health | starts at 60; +25 legume, +5/+10 for 2/3 crop families, −10 cereals only, −15 puddled rice, −15 residue burning, −30 × bare-days/365 |
| 🌡️ Climate resilience | per crop: `100 − 70 × share of sensitive-stage days above heat threshold − 100 × frost share − 15 × heavy-rain days`; averaged; −5 if heat days are trending up |
| 🧪 Soil & local fit | mean of texture fit (100 / 70 / 35) and FAO-29 salinity yield potential `100 − b (ECe − a)`; −30 for waterlogging-sensitive crops in waterlogged fields; −45 for a crop outside its recommended Punjab agro-ecological zone (e.g. cotton in the rice-wheat zone) |
| 📅 Calendar fit | `100 − 2.5 × days of late sowing`; 0 if the sequence does not fit into one year |
| 🏪 Market | Yes 100 · Unknown 60 · No 10, averaged over crops |
""")
    st.markdown("#### 3 · Your weighted result")
    st.latex(r"Score(R) = \frac{\sum_i w_i\, s_i(R)}{\sum_i w_i}")
    st.markdown("**Hard constraints:** if a rotation does not fit into one year, or contains a crop outside its "
                "recommended agro-ecological zone, its total is multiplied by 0.7 and it is labelled *Not recommended "
                "as-is* — a weighted average must not hide a deal-breaker.")
    st.markdown("`wᵢ` are your slider values on **My Farm**; `sᵢ(R)` are the factor scores above. "
                "**Confidence** rises with: ≥ 8 simulated years, NDVI loaded, soil salinity tested, all markets known, "
                "SMAP loaded.")

with t4:
    st.markdown("""
- **Not a yield or profit model.** Scores rank options relative to each other under stated assumptions.
- **Regional, not field-level data.** POWER ≈ 50 km grid; MODIS window 2 × 2 km; SMAP 9 km. Your field can differ.
- **POWER soil wetness is model-based** (MERRA-2) and does not see irrigation. SMAP measures only the top ~5 cm.
- **Low NDVI ≠ unhealthy crop.** It also marks harvest, land preparation, fallow or bare soil.
- **Hargreaves ET₀** is a temperature-based approximation of Penman-Monteith (FAO-56 recommends it when
  radiation/wind/humidity are uncertain).
- **Crop calendars, thresholds and percolation rates are regional guidance** — varieties and local practice differ.
- **Rule weights in the soil-health score are expert heuristics**, documented here so they can be challenged and changed.
- **What-if scenarios** shift the observed record uniformly; they are sensitivity tests, not climate projections.
""")

with t5:
    st.markdown("""
SMAP and GPM need a free **NASA Earthdata login**:

1. Create an account at https://urs.earthdata.nasa.gov
2. In a terminal inside the project folder run:
   ```
   python -m scripts.fetch_smap --lat 31.30 --lon 73.25
   ```
   It asks for your Earthdata username/password (never stored in the code), submits a point request to NASA
   **AppEEARS** for `SPL3SMP_E.006`, waits for it to finish and saves `data/raw/smap_<lat>_<lon>.csv`.
3. Reload Field Shift — soil-moisture charts switch to SMAP automatically and confidence increases.

**Downloaded the AppEEARS CSV yourself?** Put it in `data/raw/` and run
```
python -m scripts.convert_smap data/raw/<your-appeears-results>.csv
```
It drops fill values (−9999), averages the AM and PM overpasses and keeps SMAP's quality flag.

*Quality note:* each region has about 2,500–2,850 valid days (2015–2026). The share with SMAP's "recommended
quality" flag ranges from 88% (Okara) and 43–57% (Sheikhupura, Gujranwala, Hafizabad) to 0% (Faisalabad and
Multan, 9 km pixels that mix irrigated fields, towns and canals). Field Shift therefore uses SMAP for the
**seasonal pattern and confidence**, not for the irrigation simulation.
""")
    st.caption(f"Data folder: {C.RAW}")

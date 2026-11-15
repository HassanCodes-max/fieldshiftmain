# 🌾 Field Shift

**Crop-rotation decision support for farmers in Punjab, Pakistan, built on NASA Earth observations.**
A NASA Space Apps Challenge project.

---

## The problem

Punjab's dominant **rice → wheat** rotation feeds millions of people, but it is under pressure:

- 💧 **Water is running short.** Puddled rice is one of the thirstiest crops in the region, and groundwater is falling.
- 🌡️ **Heat stress hits sensitive stages**, such as wheat grain filling in March–April and rice flowering.
- 🔥 **Burning rice straw** damages soil and adds to the winter smog.
- 🟫 **Fields lie bare** for weeks between crops, losing soil moisture and organic matter.

Better rotations exist, such as maize → wheat, adding mungbean, or cotton → wheat in the south. The evidence needed
to compare them is spread across satellite archives, crop-water models and soil science that farmers cannot easily
use.

## The solution

Field Shift takes a farmer's location, soil, water supply, current crops and priorities. It puts 25 years of NASA
data behind them and compares crop rotations on six factors: **water use, soil health, climate resilience, soil
and local fit, calendar fit and market access**. The result is a ranked recommendation in plain language that
lists benefits, risks, the NASA evidence behind it, a confidence level and the information still missing.

It is a **decision aid to discuss with an agriculture extension officer**. It does not predict yield or profit.

Field Shift has two parts that share one data pipeline and engine:

| Part | For whom | What it offers |
|---|---|---|
| 🌐 **Public website** (`docs/`) | Farmers and the general public | 5 tap-to-answer questions, side-by-side comparison of all rotations (score, water, irrigations, six factors, bare days), soil-health table (nitrogen, cover crop, deep roots, pest cycle, erosion, fodder) with a 'how crops build soil' guide, crop price comparison from Punjab AMIS per maund and per 100 kg with prices in each market, NASA charts of the district, live 7-day weather tips; English and اردو; works on any phone, no server |
| 🔬 **Analysis platform** (Streamlit) | Extension officers, researchers, judges | 8 pages, any map location, scenario analysis, full charts, market prices, downloadable data and reports |

---

## Features of the analysis platform

| Page | What it shows |
|---|---|
| **Overview** | Farm summary, satellite map, latest NDVI and SMAP readings with dates, heat and rainfall summary, 12-month risk strip, 6-week greenness outlook, recommended next action, data-source status |
| **My Farm** | 6 preset districts or any point on a satellite map; soil texture, salinity test, irrigation source and reliability, waterlogging, residue burning, current rotation, market access per crop, priority weights; save and load a profile |
| **NASA Insights** | Temperature, rainfall vs. evaporative demand, soil moisture (SMAP and POWER), MODIS NDVI cycle with detected bare periods, full NDVI record, long-term trends, anomaly heatmaps, **animated trend-over-time map of the 6 districts** (heat days, rainfall, peak NDVI, SMAP soil moisture, year by year), CSV downloads |
| **Seasonal Analysis** | Month × stress heatmap (heat, water deficit, dry soil, heavy rain, cold, low vegetation), months where stresses overlap, current rotation against MODIS bare periods |
| **Crop Rotation** | Compare up to 4 rotations or build your own; Baseline, +1.5 °C and −10% rain scenarios; crop calendar, factor scores, irrigation need per crop and per year, **soil-health table** (nitrogen fixing, cover crop, deep roots, pest-cycle break, erosion risk, forage value), full score breakdown |
| **Recommendations** | Ranked cards with benefits, risks, NASA evidence, confidence, and **soil health, pests, erosion and forage** explanations; robustness check; information gaps; extension-officer checklist; downloadable HTML report |
| **Market Intelligence** | Punjab AMIS wholesale prices for wheat, rice and paddy, maize, moong and seed cotton by market; availability vs. the farmer's answers; price history |
| **Data & Methods** | Every dataset, formula, assumption, crop parameter and limitation |

Every number is labelled by origin: **Observed** (satellite or market), **Model / reanalysis**, **Estimated**
(calculated by Field Shift), **Forecast**, or **Farmer-entered**.

---

## Data

| Dataset | Provider | Resolution | Period | Use | Status |
|---|---|---|---|---|---|
| **NASA POWER** daily: T2M, T2M_MAX, T2M_MIN, PRECTOTCORR, RH2M, GWETTOP, GWETROOT, ALLSKY_SFC_SW_DWN, WS2M | NASA LaRC | ~0.5° × 0.625° | 2001 → 2026 | heat, rain, ET₀, soil wetness, crop simulations | ✅ in use |
| **MODIS MOD13Q1 v6.1** NDVI + pixel reliability | NASA LP DAAC via ORNL DAAC | 250 m, 16-day | 2015 → 2026 | vegetation cycle, bare-field detection, greenness outlook | ✅ in use |
| **MODIS MCD12Q1** land cover | NASA LP DAAC via ORNL DAAC | 500 m, yearly | 2022 | confirms each district point is cropland | ✅ in use |
| **SMAP SPL3SMP_E v6** surface soil moisture | NASA NSIDC DAAC via AppEEARS | 9 km, daily | Apr 2015 → Oct 2026 | soil-moisture pattern, confidence | ✅ all 6 districts |
| **GPM IMERG** Final monthly | NASA GES DISC | 0.1° | 2000 → | rainfall cross-check of POWER | ✅ public website |
| **Punjab AMIS** wholesale prices | Directorate of Agriculture (Economics & Marketing) Punjab | market level, Rs/100 kg | daily snapshots from 15 Nov 2026 | crop price comparison on the website and platform | ✅ in use |
| Local crop knowledge | Punjab Agriculture Department, AARI, PARC, FAO | district | — | sowing windows, crop coefficients, thresholds, agro-ecological zones | ✅ `data/crop_knowledge/` |
| **NASA SRTM** elevation | NASA / USGS via OpenTopoData | 90 m | 2000 (static) | slope and relief around each farm → erosion risk | ✅ in use |
| Crop soil-health traits | FAO-56 (root depth), Punjab Agriculture Dept, PARC, AARI, CCRI | crop | — | nitrogen fixing, root depth, residue, forage, pests | ✅ `crop_traits.csv` |
| GRACE/GRACE-FO · ECOSTRESS · ISRIC SoilGrids · MODIS MOD16 | — | — | — | groundwater, land-surface temperature, soil texture, evapotranspiration | ⏳ next step |

**Study districts:** Faisalabad, Sheikhupura, Gujranwala, Hafizabad, Okara and Multan. They cover the Rice-wheat,
Mixed and Cotton-wheat agro-ecological zones.

**Alignment:** each dataset is sampled at the farm coordinate and keeps its native resolution. MODIS NDVI is the
median of good-quality pixels in a ~2 × 2 km window. POWER gaps of up to 3 days are interpolated; crop seasons with
longer gaps are dropped. SMAP fill values are removed, and the AM and PM overpasses are averaged.

**SMAP quality:** each district has about 2,500–2,850 valid days. The share flagged "recommended quality" by SMAP
ranges from 88% (Okara) and 43–57% (Sheikhupura, Gujranwala, Hafizabad) to 0% (Faisalabad, Multan), where the 9 km
pixel mixes fields, towns and canals. SMAP is therefore used for seasonal patterns and confidence, not inside the
irrigation simulation.

---

## Method

### 1 · Crop water need
- Reference evapotranspiration (ET₀) uses the FAO-56 Hargreaves equation:
  `ET₀ = 0.0023 (T_mean + 17.8) √(T_max − T_min) · Ra`.
- Crop water use is `ET_c = K_c(t) · ET₀`, using the four-stage FAO-56 crop-coefficient (K_c) curve.
- A daily soil-water bucket, sized by soil texture, receives NASA rainfall. When it empties, an irrigation refills
  it. Rice adds puddling and daily seepage and percolation.
- The total of the irrigations is the **net irrigation need**, simulated on each of the last 10 years of observed
  weather.

### 2 · Six factor scores (0–100)
| Factor | Calculation |
|---|---|
| 💧 Water saving | `100 × (1 − irrigation need / 1800 mm)`, minus up to 40 if the need exceeds the farmer's water supply |
| 🌱 Soil health | legume in the rotation, crop-family diversity, puddled rice, residue burning, bare days |
| 🌡️ Climate resilience | share of sensitive-stage days above the heat threshold, frost, heavy rain; heat trend |
| 🧪 Soil & local fit | texture fit, FAO-29 salinity yield potential `100 − b(ECe − a)`, waterlogging, agro-ecological zone |
| 📅 Calendar fit | days of late sowing; 0 if the sequence does not fit into one year |
| 🏪 Market | farmer's answer per crop: Yes 100 · Unknown 60 · No 10 |

### 3 · Weighted result
`Score = Σ wᵢ sᵢ / Σ wᵢ`, where the weights `wᵢ` are the farmer's priorities. A rotation that does not fit
into one year, or that contains a crop outside its agro-ecological zone, has its score multiplied by 0.7 and is
labelled *Not recommended as-is*. Confidence depends on the number of simulated years, NDVI and SMAP coverage, a
salinity test and known markets.

### 4 · 6-week greenness outlook (machine learning)
A ridge regression predicts the MODIS NDVI anomaly 16, 32 and 48 days ahead. The anomaly is the observed value
minus the normal for that 16-day period. The inputs are the last three anomalies and the expected seasonal change.
The model is trained on all 6 districts for 2015–2026 and tested leave-one-year-out against two baselines:

| Lead | Mean absolute error (NDVI) | vs. "anomaly persists" | vs. "normal year" |
|---|---|---|---|
| 16 days | 0.042 | 16% better | 5% better |
| 32 days | 0.044 | 24% better | 1% better |
| 48 days | 0.045 | 28% better | no better |

It is a short-range signal of whether an area is greener or browner than usual. It is not a yield forecast and
does not change the rotation scores.

### 5 · Soil health, pests, erosion and forage
Each rotation gets an explanatory profile (it does not change the score):
- **Nitrogen-fixing crops** (mungbean) add nitrogen through root bacteria. **Cover crops** fill the April–June
  fallow. **Deep-rooting crops** (maize, cotton, ~1.7 m) use subsoil water and loosen the plough pan left by
  puddled rice.
- **Pest-cycle break** rises with the number of plant families. Rice → wheat (two grasses) builds up *Phalaris
  minor*, and cotton with mungbean shares whitefly.
- **Erosion risk** combines NASA SRTM slope (0.25–0.44% at the six districts, so water erosion is low), bare days,
  sandy soil and residue burning.
- **Forage value** comes from wheat straw (bhusa), maize fodder and stover, and mungbean haulm.

### 6 · Scenarios
The +1.5 °C and −10% rain scenarios shift the observed record uniformly and rerun the whole engine. They are
sensitivity tests, not climate projections.

---

## Key findings (Faisalabad, loam soil, moderate water supply)

- June averages about **43 °C** daily maximum, with about 24 days at or above 40 °C. Evaporative demand exceeds
  rainfall in 10 of 12 months.
- **Rice → Wheat needs about 1,390 mm of net irrigation per year; Maize → Wheat about 700 mm.**
- MODIS shows two green peaks per year (rabi and kharif) and about 95 bare days in the current rotation.
- **Rotations ranked first by the engine:**

  | District | Top rotation |
  |---|---|
  | Sheikhupura, Gujranwala, Hafizabad (Rice-wheat zone) | Maize → Wheat → Mungbean |
  | Faisalabad and Okara (Mixed zone) | Cotton → Wheat |
  | Multan (Cotton-wheat zone) | Maize → Wheat and Cotton → Wheat |

---

## Technology

| Layer | Tools |
|---|---|
| Data pipeline and engine | Python, pandas, NumPy, requests; NASA POWER API, ORNL DAAC MODIS web service, NASA AppEEARS, GES DISC |
| Analysis platform | Streamlit, Plotly, Folium (Esri World Imagery) |
| Public website | HTML, CSS and JavaScript with no framework, hand-built SVG charts, English and Urdu with right-to-left layout, Open-Meteo forecast, GitHub Pages |
| Testing | headless rendering test of every page (`tests/test_pages.py`) |

## Project structure

```
app.py                    navigation, sidebar, location selector, step tracker
views/                    the 8 pages of the analysis platform
src/
  config.py               paths and constants
  data_fetch.py           NASA POWER, MODIS (ORNL), land cover, SMAP loading and conversion
  preprocessing.py        cleaning, FAO-56 ET0, monthly and seasonal aggregation
  climate_analysis.py     climatology, trends, stress matrix, insights
  vegetation_analysis.py  NDVI climatology, bare-period detection, seasonal peaks
  soil_analysis.py        texture, FAO-29 salinity, soil-water assumptions
  soil_health.py          pest-cycle break, erosion risk (SRTM slope), forage, crop roles
  rotation_engine.py      scheduling, season simulation, scoring, explanations
  ndvi_forecast.py        6-week NDVI outlook (ridge regression, leave-one-year-out validation)
  visualization.py        Plotly charts
  report.py               printable farmer report
  ui.py                   state, design system, shared components, cached data
scripts/                  data download and conversion (POWER/MODIS, SMAP, AMIS) and website price export
data/crop_knowledge/      crops.csv, crop_traits.csv, rotations.csv, regions.csv (with sources and verification status)
data/raw/                 cached NASA data, AppEEARS SMAP downloads, AMIS price snapshots
docs/                     public website
tests/                    page rendering test
```

---

## Limitations

- Scores show **relative suitability** under documented assumptions. They are not yield, profit or exact
  water-saving predictions, and not a probability of success.
- Data is **regional, not field-level**: POWER ≈ 50 km, SMAP 9 km, MODIS window 2 × 2 km.
- POWER soil wetness is model-based (MERRA-2) and does not see irrigation. SMAP measures only the top ~5 cm.
- POWER shows Faisalabad's mean daily maximum about 0.8 °C lower in 2013–2025 than in 2001–2012. This should be
  checked against station data.
- Crop calendars, heat thresholds and percolation rates are regional guidance and are marked "verify locally".
- AMIS prices are wholesale market prices, not farm-gate prices, and the history starts in November 2026.
- Soil-health rule weights and pest notes are expert heuristics, documented so they can be challenged and checked locally.
- GRACE groundwater and ECOSTRESS are not yet integrated.

## Credits

- Public website: [HassanCodes-max](https://github.com/HassanCodes-max)
- Analysis platform, data pipeline and engine: the Field Shift team

## References

- NASA POWER Project, NASA Langley Research Center. https://power.larc.nasa.gov
- Didan, K. (2021). MOD13Q1 MODIS/Terra Vegetation Indices 16-Day L3 Global 250m SIN Grid V061. NASA LP DAAC.
- Friedl, M., Sulla-Menashe, D. (2022). MCD12Q1 MODIS/Terra+Aqua Land Cover Type Yearly L3 Global 500m V061. NASA LP DAAC.
- O'Neill, P. E., et al. SMAP Enhanced L3 Radiometer Global Daily 9 km EASE-Grid Soil Moisture (SPL3SMP_E), Version 6. NASA NSIDC DAAC.
- Huffman, G. J., et al. GPM IMERG Final Precipitation L3 1 month 0.1° (GPM_3IMERGM) V07. NASA GES DISC.
- Allen, R. G., Pereira, L. S., Raes, D., Smith, M. (1998). *Crop evapotranspiration.* FAO Irrigation and Drainage Paper 56.
- Ayers, R. S., Westcot, D. W. (1985). *Water quality for agriculture.* FAO Irrigation and Drainage Paper 29.
- Maas, E. V., Hoffman, G. J. (1977). Crop salt tolerance: current assessment. *J. Irrigation and Drainage Division*, ASCE.
- Punjab AMIS, Directorate of Agriculture (Economics & Marketing) Punjab. http://www.amis.pk

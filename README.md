# 🌾 Field Shift

**NASA Earth observations → smarter crop rotation decisions for farmers in Punjab, Pakistan.**
NASA Space Apps Challenge project.

Field Shift takes a farmer's location, soil, water situation and priorities, puts 25 years of real NASA data behind them,
and compares crop rotations (e.g. *Rice → Wheat* vs *Maize → Wheat → Mungbean*) for water use, soil health,
climate risk, soil and local fit, calendar fit and market access. The result is a ranked, explained recommendation
with benefits, risks, evidence and data gaps. It is a decision aid to take to an extension officer, not a yield
prediction.

Field Shift has **two parts**:

| Part | For whom | Where |
|---|---|---|
| 🌐 **Public website** (`docs/`): 5 tap-to-answer questions, English / اردو, works on any phone, no server | Farmers, judges, anyone | **https://maavia138.github.io/fieldshift/** (GitHub Pages, after step 2 below) |
| 🔬 **Analysis app** (Streamlit): map clicks for any location, what-if climate sliders, full charts and downloads | Extension officers, researchers | Run locally, or deploy free on Streamlit Community Cloud |

Website built by [HassanCodes-max](https://github.com/HassanCodes-max); data pipeline and engine are shared.
The website's numbers are produced by the same engine (see [docs/README.md](docs/README.md)).

## 🚀 Make it public (free)

1. **Upload to GitHub:** `git add . ; git commit -m "Add website and SMAP for all regions" ; git push`
2. **Website for everyone:** on GitHub open the repo → **Settings → Pages** → *Source: Deploy from a branch* →
   Branch **main**, folder **/docs** → Save. After about 1 minute it is live at
   `https://<your-github-username>.github.io/fieldshift/`. It works on any phone or laptop, anywhere.
3. **Analysis app online (optional):** go to https://share.streamlit.io → sign in with GitHub → *Create app* →
   repo `fieldshift`, branch `main`, file `app.py` → Deploy. You get a public `https://….streamlit.app` link.

To preview the website on your own laptop: `cd docs ; python -m http.server 8000` → http://localhost:8000

---

## Quick start

```powershell
cd D:\fieldshift
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m streamlit run app.py
```

Then open http://localhost:8501.

- NASA data for the 6 preset regions is already cached in `data/raw/`, so the demo works offline.
- To re-download: `python -m scripts.prefetch --refresh`.
- To run the smoke test of every page: `python tests/test_pages.py`.

## What the app does (pages)

| Page | What the farmer / judge sees |
|---|---|
| 🏠 **Home** | The story, how it works, which NASA datasets are inside |
| 🧑‍🌾 **My Farm** | Clickable satellite map or 6 preset districts; soil type, salinity test, irrigation source and reliability, waterlogging, residue burning, current rotation, market access per crop; priority sliders; save/load profile |
| 🛰️ **NASA Insights** | KPIs and plain-language findings; monthly temperature, rain vs. evaporative demand, soil wetness, MODIS NDVI seasonal cycle with detected bare-field periods, full NDVI record, long-term trends, anomaly heatmaps, CSV downloads |
| 📅 **Seasonal Analysis** | Month × stress heatmap (heat, water deficit, dry soil, heavy rain, cold, low vegetation); months where stresses overlap; current rotation overlaid on the MODIS bare periods; season table; hot-spring vs. wheat greenness (POWER × MODIS) |
| 🔄 **Compare Rotations** | Pick up to 4 alternatives or build your own; **what-if climate sliders** (+°C, ±% rain); overall score, crop calendar, factor scores, irrigation need per crop, year-to-year water need, full score breakdown |
| ✅ **Recommendations** | Ranked cards with benefits, risks, NASA evidence, confidence; robustness check; information gaps; extension-officer checklist; **downloadable HTML report** |
| 📚 **Data & Methods** | Every dataset, formula, assumption, crop parameter and limitation |

## NASA data used

| Dataset | Use | Access |
|---|---|---|
| **NASA POWER** daily (T2M, T2M_MAX, T2M_MIN, PRECTOTCORR, RH2M, GWETTOP, GWETROOT, ALLSKY_SFC_SW_DWN, WS2M), 2001 → present | heat, rain, ET₀, soil wetness, crop simulations | API, no login ✅ |
| **MODIS MOD13Q1 v6.1** NDVI 250 m / 16-day, 2015 → present | vegetation cycle, bare-field detection | ORNL DAAC web service, no login ✅ |
| **MODIS MCD12Q1** land cover | confirms each preset point is cropland | ORNL DAAC ✅ |
| **SMAP SPL3SMP_E.006** 9 km | satellite soil moisture | ✅ all 6 regions cached (2015-04 → 2026-10; raw AppEEARS files in `data/raw/appeears/`). New points: `python -m scripts.fetch_smap --lat .. --lon ..` (Earthdata login) or download from AppEEARS and run `python -m scripts.convert_smap <file>.csv` |
| **GPM IMERG** 0.1° | rainfall cross-check | Earthdata login (next step) 🔑 |

## How the engine works (short version)

1. **Schedule:** place each crop of a rotation in its regional sowing window. This gives the turnaround days, late
   sowing, bare days, and whether the sequence fits in 12 months.
2. **Simulate on real weather:** for each of the last 10 years, run every crop through that year's daily NASA POWER
   weather:
   - FAO-56 crop coefficient × Hargreaves ET₀ → crop water use;
   - a daily soil-water bucket with NASA rain → **net irrigation need**;
   - count heat, frost and heavy-rain days inside each crop's **sensitive growth stage**.
3. **Score six factors (0–100)** and combine them with the farmer's slider weights: `Score = Σ wᵢ sᵢ / Σ wᵢ`.
   A sequence that doesn't fit into one year, or a crop outside its agro-ecological zone, is a hard gate (×0.7).
4. **Explain:** produce evidence sentences with NASA numbers, benefits vs. the current rotation, risks, data gaps and
   a confidence level.

All crop parameters are in `data/crop_knowledge/crops.csv`, each with its source and verification status.

## Project structure

```
docs/                     public website (GitHub Pages): index.html, app.js, i18n.js, data/*.json
app.py                    navigation + sidebar
views/                    the 7 pages
src/
  config.py               paths, constants
  data_fetch.py           NASA POWER, MODIS (ORNL), land cover, SMAP loader
  preprocessing.py        cleaning, ET0 (FAO-56), monthly/seasonal aggregation
  climate_analysis.py     climatology, trends, stress matrix, insights
  vegetation_analysis.py  NDVI climatology, bare-period detection, peaks
  soil_analysis.py        texture, salinity (FAO-29), soil-water assumptions
  rotation_engine.py      scheduling, season simulation, scoring, explanations
  visualization.py        Plotly charts (colour follows crop/rotation)
  report.py               printable farmer report
  ui.py                   state, styling, cached data
scripts/prefetch.py       download data for preset regions
scripts/fetch_smap.py     SMAP via NASA AppEEARS (needs Earthdata login)
scripts/convert_smap.py   convert a manually downloaded AppEEARS SMAP CSV
data/raw/                 cached NASA data
data/crop_knowledge/      crops.csv, rotations.csv, regions.csv
tests/test_pages.py       renders every page headlessly
```

## 5-minute demo script

1. **Home:** "A farmer near Faisalabad grows rice and wheat every year. Water is getting less reliable and summers
   hotter. Should they change?"
2. **My Farm:** click the satellite map, set soil = loam, water = Moderate, priority = save water.
3. **NASA Insights:** June averages 43 °C with about 24 days ≥ 40 °C; evaporative demand exceeds rain in 10 of 12
   months. In the NDVI tab, MODIS shows two green peaks and a bare period after the wheat harvest.
4. **Seasonal Analysis:** the stress calendar shows May–June as a heat and water-deficit hot spot. The current
   rotation leaves the field bare for about 95 days.
5. **Compare Rotations:** Rice → Wheat needs about 1,390 mm/yr of net irrigation; Maize → Wheat about 700 mm.
   Move the +°C slider and watch the risks change.
6. **Recommendations:** walk through the top-ranked card (benefits, risks, NASA evidence, confidence), then
   download the report.
7. **Data & Methods:** "every number is traceable — and here's what our data cannot tell you."

## Limitations

- These are relative suitability scores under documented assumptions, not yield or profit predictions.
- Data is regional (POWER ≈ 50 km, MODIS window 2 × 2 km, SMAP 9 km), not field-level.
- POWER soil wetness is model-based and does not see irrigation.
- Crop calendars and thresholds are regional guidance and need local verification.

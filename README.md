# 🌾 Field Shift

**Crop-rotation decision support for farmers in Punjab, Pakistan, built on NASA Earth observations.**
A NASA Space Apps Challenge project · English and اردو.

Field Shift replays every crop rotation on 25 years of NASA weather, satellite greenness and soil moisture for a
farmer's district — or any spot they tap on a satellite map — and shows which rotation saves water, protects the
soil and copes with heat, with the evidence behind it and how sure we are.

> It is a decision aid to discuss with an agriculture extension officer. It does not predict yield or profit.

---

## Version 2 — what changed

| | Version 1 (Streamlit + static page) | Version 2 (this repository) |
|---|---|---|
| App | Python Streamlit: every click re-ran the page on the server; 30 s+ cold starts | **Next.js 16 + TypeScript + Tailwind**, static/streamed pages, API routes; pages answer in ~15–70 ms |
| Engine | Python only | **TypeScript port verified against the Python engine** (480 rotation evaluations, climate, NDVI, ML outlook, soil health match to 1e-6) |
| Locations | 6 districts on the website; map only in Streamlit | 6 districts **plus any point in Pakistan**: NASA POWER and SRTM downloaded live (~3 s), cached in Postgres |
| Data store | CSV/JSON files | **Postgres** (Supabase/Neon): saved shareable plans, feedback, NASA cache, AMIS price history, usage stats, rate limits |
| Market prices | manual script runs | **daily Vercel Cron** scrapes Punjab AMIS into the database; history grows automatically |
| Language | partial Urdu | **complete English / Urdu** (right-to-left, Nastaliq, Urdu numerals) — enforced by tests |
| Okara point | 30.75 N, 73.35 E — MODIS land cover says 44 % savanna | moved to **30.70 N, 73.35 E** (100 % cropland); all datasets re-downloaded |
| Rain check | not in the platform | **GPM IMERG** cross-check of POWER rainfall in all districts (within ±10 %) |
| Security | none needed (local) | strict validation, rate limiting, RLS, CSP/HSTS headers, no secrets in code |
| Hosting | localhost / sleeping free tier | **Vercel** production deployment from GitHub (`main` → production, other branches → previews) |

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design.

## Features

- **Crop advisor** — 5 tap-to-answer questions (district or map/GPS point, current rotation or build-your-own,
  water source and reliability, soil texture / salinity test / waterlogging / straw burning, priorities). Advanced:
  market access per crop, six priority weights, +1.5 °C / −10 % rain scenarios, up to 4 custom rotations to compare.
  Results update live: verdict with match score, water saving, irrigations per year, confidence; benefits and risks;
  crop calendar; side-by-side comparison of all rotations and six factor scores; soil health (nitrogen, cover,
  deep roots, pest-cycle break, erosion from NASA SRTM slope, fodder); NASA evidence, score breakdown, robustness and
  information gaps. **Save** creates a short shareable link (WhatsApp) and the server recomputes the result.
- **My land** — any district or map point: latest MODIS NDVI and SMAP readings vs normal, heat and rain KPIs,
  plain-language insights, month-by-month risk grid, temperature, rain vs crop water demand (POWER and GPM IMERG),
  NDVI cycle with detected bare periods, every NDVI reading since 2015, SMAP by month, rain-data check, 25-year trends,
  year × month anomaly grids, **6-week greenness outlook (ML)**, live 7-day forecast with farm tips, CSV download.
- **Market prices** — Punjab AMIS wholesale prices per maund and per 100 kg, by market and variety, with history.
- **District trends** — animated satellite map of the six districts, year by year (heat, rain, NDVI, SMAP).
- **How it works** — every dataset, formula, assumption, the ML model's skill table, crop parameters, references.

## Data

| Dataset | Use |
|---|---|
| NASA POWER daily (T2M, T2M_MAX, T2M_MIN, PRECTOTCORR, RH2M, GWETTOP, GWETROOT, ALLSKY_SFC_SW_DWN, WS2M), 2001 → | crop simulation, heat/frost/heavy-rain stress, climatology, trends |
| MODIS MOD13Q1 v6.1 NDVI (250 m, 16-day), 2015 → | bare-field detection, greenness cycle, ML outlook |
| MODIS MCD12Q1 land cover | checks each district point is cropland |
| SMAP SPL3SMP_E v6 (9 km), 2015 → | surface soil moisture, confidence |
| GPM IMERG Final V07 monthly (0.1°) | cross-check of POWER rainfall |
| NASA SRTM 90 m | slope → erosion risk |
| Punjab AMIS wholesale prices (daily) | market page |
| Open-Meteo | 7-day forecast and farm tips |
| FAO-56, FAO-29, Punjab Agriculture Dept, AARI, PARC, CCRI | crop coefficients, salinity thresholds, sowing windows, traits |

## Method (short)

1. **Water** — FAO-56 Hargreaves ET₀ × crop coefficient curve; daily soil-water bucket by texture; rice adds puddling
   and percolation. Net irrigation need on each of the last 10 observed years.
2. **Six factor scores (0–100)** — water saving, soil health, climate resilience, soil & local fit (texture,
   FAO-29 salinity, waterlogging, agro-ecological zone), calendar fit, market. Weighted by the farmer's priorities;
   deal-breakers multiply the score by 0.7.
3. **6-week greenness outlook** — ridge regression on MODIS NDVI anomalies, trained on 6 districts 2015–2026 and
   validated leave-one-year-out (16 % better than persistence at 16 days).
4. **Soil-health profile** — explanatory, does not change scores.

## Run it

```bash
npm ci
npm run dev          # http://localhost:3000 — uses a local PGlite database in .data/ (no setup)
npm test             # engine parity + platform tests
npm run build && npm start
```

Python pipeline (only to refresh NASA data or retrain the model):

```bash
cd pipeline
pip install -r requirements-dev.txt
python -m scripts.fetch_earthdata        # SMAP + IMERG (NASA Earthdata login)
python -m scripts.prefetch               # POWER, MODIS, land cover
python -m scripts.export_web_data        # → data/generated/*.json and tests/golden/*.json
```

## Deploy (Vercel)

1. Import the GitHub repository in Vercel (framework: Next.js). `main` deploys to production; other branches and pull
   requests get preview deployments.
2. Add a database: Vercel → Storage → **Supabase** or **Neon** → connect to the project (sets `POSTGRES_URL`).
   Tables are created automatically on first use.
3. Environment variables: `CRON_SECRET` and `RATE_LIMIT_SALT` (long random strings). See `.env.example`.
4. `vercel.json` schedules the daily AMIS refresh (`/api/cron/amis`, 12:30 Pakistan time).

## Project structure

```
app/                 Next.js routes ([lang] pages, api/ route handlers)
components/          UI (advisor, land report, charts, map, layout)
lib/engine/          TypeScript engine (pure): weather, rotation, climate, ndvi, soilHealth
lib/server/          data loaders, NASA fetch + cache, advice, land report, market, plans, db, rate limit
lib/i18n/            English / Urdu dictionaries and fact sentences
data/generated/      NASA datasets and model exported by the pipeline
pipeline/            Python data pipeline and original engine (source of truth for tests/golden)
tests/               Vitest: engine parity (golden), translations, AMIS parser, validation
docs/ARCHITECTURE.md design, rendering, API, security
```

## Limitations

- Scores show relative suitability under documented assumptions — not yield, profit or exact water savings.
- Data is regional (POWER ≈ 50 km, SMAP 9 km, MODIS ≈ 2 × 2 km). New map points get POWER and SRTM only.
- POWER soil wetness is modelled and does not see irrigation. Crop calendars and thresholds are regional guidance.
- AMIS prices are wholesale market prices.

## Credits & references

The Field Shift team (NASA Space Apps Challenge). NASA POWER (LaRC); MODIS MOD13Q1 and MCD12Q1 (LP DAAC, via ORNL DAAC);
SMAP SPL3SMP_E (NSIDC DAAC, via AppEEARS); GPM IMERG (GES DISC); SRTM via OpenTopoData; Punjab AMIS; Open-Meteo;
Allen et al. (1998) FAO-56; Ayers & Westcot (1985) FAO-29; Maas & Hoffman (1977).

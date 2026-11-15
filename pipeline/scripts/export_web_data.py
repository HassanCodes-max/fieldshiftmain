"""Export the data the web app needs, plus golden reference outputs for the TypeScript engine port.

    python -m scripts.export_web_data            # from the pipeline/ folder

Writes (paths relative to the repository root):
    data/generated/knowledge.json        crops, rotations, regions, soil-health traits, engine constants
    data/generated/districts/<id>.json   raw NASA POWER daily record, MODIS NDVI, SMAP, GPM IMERG, SRTM, land cover
    data/generated/ndvi_model.json       ridge-regression NDVI outlook model (coefficients, error bands, skill)
    data/generated/prices_seed.json      AMIS price snapshots used to seed the database
    tests/golden/*.json                  outputs of the Python engine that the TypeScript engine must reproduce

The web app never runs Python: it ports the engine to TypeScript and `npm test` checks it against tests/golden.
"""
from __future__ import annotations

import glob
import json
import math
import random
from pathlib import Path

import numpy as np
import pandas as pd

from src import climate_analysis as CA
from src import config as C
from src import data_fetch as F
from src import ndvi_forecast as N
from src import preprocessing as P
from src import rotation_engine as R
from src import soil_analysis as S
from src import soil_health as SH
from src import vegetation_analysis as V

REPO = C.ROOT.parent
OUT = REPO / "data" / "generated"
GOLD = REPO / "tests" / "golden"
POWER_COLS = ["T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "RH2M", "GWETTOP", "GWETROOT", "ALLSKY_SFC_SW_DWN", "WS2M"]
CUSTOM_ROTATIONS = [["wheat", "mungbean"], ["cotton", "wheat", "mungbean"], ["rice", "wheat", "maize"],
                    ["mungbean", "rice", "wheat"], ["maize", "mungbean"]]


def clean(x):
    """JSON-safe value: NaN/inf -> None, numpy -> python, dates -> ISO."""
    if isinstance(x, dict):
        return {str(k): clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [clean(v) for v in x]
    if isinstance(x, (pd.Timestamp,)):
        return None if pd.isna(x) else x.date().isoformat()
    if hasattr(x, "isoformat") and not isinstance(x, str):
        return x.isoformat()
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, (float, np.floating)):
        return None if (math.isnan(x) or math.isinf(x)) else float(x)
    if isinstance(x, (np.bool_,)):
        return bool(x)
    return x


def dump(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(clean(obj), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  {path.relative_to(REPO)}  {path.stat().st_size / 1024:,.0f} KB")


def records(df: pd.DataFrame) -> list[dict]:
    return [clean(r) for r in df.to_dict("records")]


# --------------------------------------------------------------------------- knowledge
def knowledge() -> dict:
    crops = R.load_crops()
    rot = R.load_rotations()
    reg = R.load_regions()
    traits = SH.load_traits().reset_index()
    return {
        "crops": records(crops.reset_index(drop=True)),
        "rotations": [{"id": r.rotation_id, "name": r.name, "crops": r.crops.split(";"), "description": r.description}
                      for r in rot.itertuples()],
        "regions": [{"id": r.region_id, "name": r.name, "district": r.district, "lat": float(r.lat),
                     "lon": float(r.lon), "zone": r.zone, "typicalRotation": r.typical_rotation, "note": r.note}
                    for r in reg.itertuples()],
        "traits": records(traits),
        "constants": {
            "BASELINE_YEARS": C.BASELINE_YEARS, "HOT_DAY_C": C.HOT_DAY_C, "HEAVY_RAIN_MM": C.HEAVY_RAIN_MM,
            "IRRIGATION_DEPTH_MM": C.IRRIGATION_DEPTH_MM, "TURNAROUND_DAYS": C.TURNAROUND_DAYS,
            "MAX_LATE_DAYS": C.MAX_LATE_DAYS, "RAIN_BIAS_WARN_PCT": C.RAIN_BIAS_WARN_PCT,
            "WATER_SUPPLY_MM": R.WATER_SUPPLY_MM, "WATER_SCORE_MAX_MM": R.WATER_SCORE_MAX_MM,
            "BUCKET_MM": S.BUCKET_MM, "RICE_PERCOLATION": S.RICE_PERCOLATION,
            "SALINITY_CLASSES": S.SALINITY_CLASSES, "ASSUMED_ECE": S.ASSUMED_ECE, "TEXTURES": S.TEXTURES,
        },
    }


# --------------------------------------------------------------------------- districts
def district(reg) -> dict:
    lat, lon = float(reg.lat), float(reg.lon)
    raw, meta = F.load_power(lat, lon)
    raw = raw.sort_values("date")
    out = {"id": reg.region_id, "lat": lat, "lon": lon,
           "power": {"dates": [d.date().isoformat() for d in raw["date"]],
                     **{c: [None if pd.isna(v) else float(v) for v in raw[c]] for c in POWER_COLS}},
           "powerMeta": {k: meta.get(k) for k in ("source", "retrieved_utc", "start", "end") if k in meta}}
    nd = F.load_ndvi(lat, lon)
    out["ndvi"] = {"dates": [d.date().isoformat() for d in nd["date"]],
                   "ndvi": [None if pd.isna(v) else float(v) for v in nd["ndvi"]]}
    sm = F.load_smap_if_available(lat, lon)
    if sm is not None:
        sm = sm.sort_values("date")
        out["smap"] = {"dates": [d.date().isoformat() for d in sm["date"]],
                       "sm": [float(v) for v in sm["soil_moisture"]],
                       "rec": [bool(v) for v in sm["recommended"]] if "recommended" in sm else None}
    im = F.load_imerg_if_available(lat, lon)
    if im is not None:
        out["imerg"] = {"year": [int(v) for v in im["year"]], "month": [int(v) for v in im["month"]],
                        "mm": [float(v) for v in im["imerg_rain_mm"]]}
    out["srtm"] = F.load_srtm(lat, lon, fetch=False)
    out["landcover"] = F.load_landcover(lat, lon)
    return out


def bundle(reg, temp=0.0, rain_pct=0):
    lat, lon = float(reg.lat), float(reg.lon)
    raw, _ = F.load_power(lat, lon)
    daily = P.clean_power(raw, lat, temp_offset=temp, rain_factor=1 + rain_pct / 100)
    nd = V.clean_ndvi(F.load_ndvi(lat, lon))
    nclim = V.ndvi_climatology(nd)
    windows, thr = V.low_vegetation_windows(nclim)
    monthly = P.to_monthly(daily)
    years = CA.recent_years(P.complete_years(daily))
    im = F.load_imerg_if_available(lat, lon)
    obs_monthly = P.to_monthly(P.clean_power(raw, lat)) if (temp or rain_pct) else monthly
    rc = CA.rain_crosscheck(obs_monthly, im, years) if im is not None else None
    return {"daily": daily, "raw": raw, "nd": nd, "nclim": nclim, "windows": windows, "thr": thr,
            "monthly": monthly, "years": years, "rc": rc, "smap": F.load_smap_if_available(lat, lon)}


# --------------------------------------------------------------------------- golden: engine
def eval_record(e: R.Evaluation) -> dict:
    pc = e.per_crop
    return {
        "crops": e.crop_ids, "total": e.total, "scores": e.scores, "water": e.water_mm,
        "waterRange": list(e.water_range), "confidence": e.confidence, "nGates": len(e.gates),
        "bareCover": e.bare_cover_pct, "baselineYears": e.baseline_years,
        "schedule": {"feasible": e.schedule.feasible, "firstCropLate": e.schedule.first_crop_late,
                     "bareDays": e.schedule.bare_days,
                     "slots": [{"crop": s.crop_id, "sow": s.sow.isoformat(), "harvest": s.harvest.isoformat(),
                                "late": s.late_days} for s in e.schedule.slots]},
        "perCrop": [{"crop": r["crop_id"], "irrigation": r.get("irrigation_mm"), "etc": r.get("etc_mm"),
                     "rain": r.get("rain_mm"), "heat": r.get("heat_days"), "cold": r.get("cold_days"),
                     "heavy": r.get("heavy_rain_days"), "climate": r.get("climate_score")}
                    for r in pc.to_dict("records")],
        "perYear": records(e.per_year) if not e.per_year.empty else [],
        "nRisks": len(e.risks), "nBenefits": len(e.benefits), "nGaps": len(e.gaps),
    }


def golden_engine(regions, crops, rotations) -> dict:
    rnd = random.Random(2026)
    markets = ["Yes", "Unknown", "No"]
    cases = []
    for reg in regions.itertuples():
        scen_cache = {}
        for k in range(8):
            temp, rain = [(0.0, 0), (0.0, 0), (0.0, 0), (1.5, 0), (0.0, -10), (0.0, 0), (1.5, -10), (0.0, 0)][k]
            key = (temp, rain)
            if key not in scen_cache:
                scen_cache[key] = bundle(reg, temp, rain)
            b = scen_cache[key]
            sal = rnd.choice(list(S.SALINITY_CLASSES))
            profile = {
                "soil_texture": rnd.choice(S.TEXTURES), "salinity_class": sal, "ece": S.SALINITY_CLASSES[sal],
                "waterlogging": rnd.random() < 0.3, "zone": None if k == 7 else reg.zone,
                "irrigation": rnd.choice(["Canal", "Tubewell", "Canal + tubewell", "Rainfed"]),
                "water_availability": rnd.choice(list(R.WATER_SUPPLY_MM)), "burns_residue": rnd.random() < 0.6,
                "market": {c: rnd.choice(markets) for c in crops.index},
                "weights": {f: rnd.randint(0, 10) for f in R.FACTORS},
            }
            use_ndvi = k != 5
            low = V.window_doys(b["windows"]) if use_ndvi else None
            status = {"ndvi": use_ndvi, "smap": b["smap"] is not None and k != 6,
                      "imerg_bias_pct": b["rc"]["bias_pct"] if b["rc"] else None}
            rots = [r for r in rotations.values()] + CUSTOM_ROTATIONS
            evals = [R.evaluate_rotation(ids, profile, b["daily"], crops, low, status) for ids in rots]
            cur = evals[rnd.randrange(len(rotations))]
            R.compare(evals, cur)
            cases.append({"region": reg.region_id, "temp": temp, "rain": rain, "profile": profile,
                          "useNdvi": use_ndvi, "status": status, "current": cur.crop_ids,
                          "evals": [eval_record(e) for e in evals]})
    return {"cases": cases}


# --------------------------------------------------------------------------- golden: analysis
def golden_analysis(regions, model, traits, crops) -> dict:
    out = {}
    names = {c: crops.loc[c, "name"].split(" (")[0] for c in crops.index}
    for reg in regions.itertuples():
        b = bundle(reg)
        daily, monthly, years = b["daily"], b["monthly"], b["years"]
        clim = CA.climatology(monthly, years)
        all_years = P.complete_years(daily)
        annual = CA.annual_summary(daily, all_years)
        tr = CA.trends(annual)
        stress = CA.stress_matrix(clim, b["nclim"])
        peaks = V.seasonal_peaks(b["nd"])
        o = N.outlook(model, reg.region_id, b["nd"])
        srtm = F.load_srtm(float(reg.lat), float(reg.lon), fetch=False)
        sh = {}
        for rid, ids in {r.rotation_id: r.crops.split(";") for r in R.load_rotations().itertuples()}.items():
            sch = R.schedule_rotation(ids, crops)
            for tex in ("sandy", "loam"):
                for burn in (True, False):
                    p = SH.profile(ids, sch.bare_days, tex, burn, srtm["slope_pct"] if srtm else None, traits, names)
                    sh[f"{rid}|{tex}|{int(burn)}"] = {k: p[k] for k in ("pest", "erosion", "forage", "n_fixing",
                                                                       "deep", "cover", "families")}
        out[reg.region_id] = {
            "years": years, "allYears": all_years, "quality": P.data_quality(b["raw"], daily),
            "clim": records(clim.drop(columns=["month_name"])),
            "monthlyTail": records(monthly.tail(24).drop(columns=["date"])),
            "annual": records(annual), "trends": tr,
            "stress": [{k: (v[0] if isinstance(v, tuple) else v) for k, v in r.items()} for r in stress.to_dict("records")],
            "crosscheck": None if b["rc"] is None else {k: b["rc"][k] for k in ("power_mm", "imerg_mm", "bias_pct",
                                                                               "r_monthly", "n_months", "agrees")},
            "ndviClim": records(b["nclim"][["slot", "ndvi", "p25", "p75", "n_years", "doy", "month"]]),
            "windows": [{"start": w["start"], "end": w["end"], "min": w["min_ndvi"], "slots": w["slots"]}
                        for w in b["windows"]],
            "threshold": b["thr"], "windowDoys": sorted(V.window_doys(b["windows"])),
            "peaks": records(peaks),
            "outlook": {"lastDate": o.last_date, "lastNdvi": o.last_ndvi, "lastClim": o.last_clim,
                        "table": records(o.table)},
            "soilHealth": sh,
        }
    return out


# --------------------------------------------------------------------------- main
def main():
    regions = R.load_regions()
    crops = R.load_crops()
    rotations = {r.rotation_id: r.crops.split(";") for r in R.load_rotations().itertuples()}
    traits = SH.load_traits()

    print("Web data:")
    dump(OUT / "knowledge.json", knowledge())
    for reg in regions.itertuples():
        dump(OUT / "districts" / f"{reg.region_id}.json", district(reg))

    series = {r.region_id: V.clean_ndvi(F.load_ndvi(float(r.lat), float(r.lon))) for r in regions.itertuples()}
    model = N.train(series)
    dump(OUT / "ndvi_model.json", {
        "leads": list(N.LEADS), "lags": N.LAGS, "ridge": N.RIDGE,
        "coefs": {str(h): list(map(float, c)) for h, c in model.coefs.items()},
        "residQ": {str(h): list(q) for h, q in model.resid_q.items()},
        "skill": records(model.skill),
        "clims": {r: {str(int(k)): float(v) for k, v in c.items()} for r, c in model.clims.items()},
        "trainedOn": sorted({int(y) for d in series.values() for y in d["year"].unique()}),
    })

    files = sorted(glob.glob(str(C.RAW / "amis" / "amis_prices_*.csv")))
    if files:
        d = pd.concat([pd.read_csv(f) for f in files]).drop_duplicates(["commodity", "market", "date"])
        dump(OUT / "prices_seed.json", [{"commodity": r.commodity, "crop": r.crop, "market": r.market,
                                         "date": str(r.date), "price": float(r.price)} for r in d.itertuples()])

    print("Golden reference outputs:")
    dump(GOLD / "engine.json", golden_engine(regions, crops, rotations))
    dump(GOLD / "analysis.json", golden_analysis(regions, model, traits, crops))


if __name__ == "__main__":
    main()

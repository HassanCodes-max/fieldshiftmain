"""Field Shift rotation engine.

Transparent multi-criteria decision support:
  1. schedule each rotation on the calendar (sowing windows, durations, turnaround)
  2. for every recent year, run the crop through the *actual* NASA POWER daily weather:
       - FAO-56 crop water use (Kc x Hargreaves ET0) and a daily soil-water bucket
         -> estimated net irrigation need
       - heat / cold / heavy-rain days inside each crop's sensitive growth stage
  3. score six factors on 0-100, combine with the farmer's weights
  4. produce plain-language evidence, benefits, risks and data gaps

Scores are relative suitability under stated assumptions - not yield or profit predictions.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from . import config as C
from . import soil_analysis as S

REF_YEAR = 2021  # non-leap reference year for calendars

FACTORS = {
    "water": "Water saving",
    "soil": "Soil health",
    "climate": "Climate resilience",
    "soilfit": "Soil & local fit",
    "calendar": "Calendar fit",
    "market": "Market access",
}

WATER_SUPPLY_MM = {"Reliable": 1600, "Moderate": 1000, "Limited": 600}
WATER_SCORE_MAX_MM = 1800  # net irrigation at which the water score reaches 0


# --------------------------------------------------------------------------- knowledge
def load_crops() -> pd.DataFrame:
    df = pd.read_csv(C.KNOWLEDGE / "crops.csv", encoding="utf-8")
    return df.set_index("crop_id", drop=False)


def load_rotations() -> pd.DataFrame:
    return pd.read_csv(C.KNOWLEDGE / "rotations.csv", encoding="utf-8")


def load_regions() -> pd.DataFrame:
    return pd.read_csv(C.KNOWLEDGE / "regions.csv", encoding="utf-8")


def validate_rotation(crop_ids: list[str], crops: pd.DataFrame) -> str | None:
    """Return a farmer-readable problem with a crop sequence, or None if it can be evaluated.

    Each crop has one regional sowing window per year, so the same crop cannot appear twice in a
    one-year rotation; the engine also keys its per-crop results by crop id.
    """
    if len(crop_ids) < 2:
        return "A rotation needs at least two crops."
    unknown = [c for c in crop_ids if c not in crops.index]
    if unknown:
        return f"Unknown crop(s): {', '.join(unknown)}."
    if len(set(crop_ids)) != len(crop_ids):
        rep = sorted({crops.loc[c, 'name'].split(' (')[0] for c in crop_ids if crop_ids.count(c) > 1})
        return (f"{', '.join(rep)} appears more than once. Each crop has one sowing window per year, "
                f"so a one-year rotation can include it only once.")
    return None


def rotation_label(crop_ids: list[str], crops: pd.DataFrame) -> str:
    return " → ".join(crops.loc[c, "name"].split(" (")[0] for c in crop_ids)


def _mmdd(s: str, year: int) -> dt.date:
    m, d = map(int, s.split("-"))
    return dt.date(year, m, d)


def _window(c, year):
    return _mmdd(c["sow_start"], year), _mmdd(c["sow_end"], year)


def fmt(d: dt.date) -> str:
    return d.strftime("%d %b").lstrip("0")


# --------------------------------------------------------------------------- schedule
@dataclass
class Slot:
    crop_id: str
    sow: dt.date
    harvest: dt.date
    late_days: int
    window: tuple


@dataclass
class Schedule:
    crops: list[str]
    slots: list[Slot] = field(default_factory=list)
    feasible: bool = True
    first_crop_late: int = 0
    bare_days: int = 0
    bare_periods: list[tuple] = field(default_factory=list)
    issues: list[str] = field(default_factory=list)


def schedule_rotation(crop_ids: list[str], crops: pd.DataFrame) -> Schedule:
    sch = Schedule(crops=list(crop_ids))
    first = crops.loc[crop_ids[0]]
    ws, we = _window(first, REF_YEAR)
    t0 = ws + dt.timedelta(days=round((we - ws).days * 0.3))
    prev_harvest = None
    for i, cid in enumerate(crop_ids):
        c = crops.loc[cid]
        dur = int(c["duration_days"])
        if i == 0:
            sow, late, win = t0, 0, (ws, we)
        else:
            earliest = prev_harvest + dt.timedelta(days=C.TURNAROUND_DAYS)
            sow = late = win = None
            for y in range(earliest.year - 1, earliest.year + 2):
                a, b = _window(c, y)
                if b + dt.timedelta(days=C.MAX_LATE_DAYS) >= earliest:
                    sow = max(earliest, a)
                    late = max(0, (sow - b).days)
                    win = (a, b)
                    break
        harvest = sow + dt.timedelta(days=dur)
        sch.slots.append(Slot(cid, sow, harvest, late, win))
        if late > 0:
            sch.issues.append(
                f"{c['name'].split(' (')[0]} would be sown about {late} days after its recommended "
                f"window ({fmt(win[0])}–{fmt(win[1])}) because the previous crop is still in the field.")
        prev_harvest = harvest

    cycle_end = t0 + dt.timedelta(days=365)
    need = (prev_harvest + dt.timedelta(days=C.TURNAROUND_DAYS) - cycle_end).days
    slack = (we - t0).days
    if need > 0:
        sch.first_crop_late = max(0, need - slack)
        if sch.first_crop_late > C.MAX_LATE_DAYS or need > slack + C.MAX_LATE_DAYS:
            sch.feasible = False
            sch.issues.append(
                f"The sequence needs about {365 + need} days - it does not fit into one year "
                f"without moving {first['name'].split(' (')[0]} far outside its sowing window.")
        elif sch.first_crop_late > 0:
            sch.issues.append(
                f"Next year's {first['name'].split(' (')[0]} would start ~{sch.first_crop_late} days "
                f"after its recommended window.")
    # bare periods inside one cycle
    for i, s in enumerate(sch.slots):
        nxt = sch.slots[i + 1].sow if i + 1 < len(sch.slots) else cycle_end
        if (nxt - s.harvest).days > 0:
            sch.bare_periods.append((s.harvest, nxt))
    sch.bare_days = max(0, 365 - sum(int(crops.loc[c, "duration_days"]) for c in crop_ids))
    return sch


def covered_doys(sch: Schedule) -> set[int]:
    days = set()
    for s in sch.slots:
        t = s.sow
        while t < s.harvest:
            days.add(t.timetuple().tm_yday)  # REF_YEAR and REF_YEAR+1 are both non-leap
            t += dt.timedelta(days=1)
    return days


# --------------------------------------------------------------------------- per-season simulation
def kc_curve(c, n: int) -> np.ndarray:
    fr = np.array([c["f_ini"], c["f_dev"], c["f_mid"], c["f_late"]], float)
    L = np.round(fr / fr.sum() * n).astype(int)
    L[-1] = n - L[:-1].sum()
    ini, mid, end = c["kc_ini"], c["kc_mid"], c["kc_end"]
    return np.concatenate([
        np.full(L[0], ini),
        np.linspace(ini, mid, L[1], endpoint=False),
        np.full(L[2], mid),
        np.linspace(mid, end, L[3]),
    ])[:n]


def simulate_season(c, wx: pd.DataFrame, texture: str) -> dict:
    """Run one crop season through daily weather. wx: daily rows for the season."""
    n = len(wx)
    kc = kc_curve(c, n)
    et0 = wx["ET0"].to_numpy()
    rain = wx["PRECTOTCORR"].to_numpy()
    tmax = wx["T2M_MAX"].to_numpy()
    tmin = wx["T2M_MIN"].to_numpy()
    etc = kc * et0
    puddled = str(c["puddled"]) == "yes"
    if puddled:
        cap = float(c["bucket_mm"])
        perc = S.RICE_PERCOLATION.get(texture, float(c["percolation_mm_day"]))
        loss = etc + perc
        irrigation = float(c["land_prep_mm"])
    else:
        cap = float(S.BUCKET_MM.get(texture, c["bucket_mm"]))
        loss = etc
        irrigation = 0.0
    store, events, runoff = cap * 0.5, 0, 0.0
    for i in range(n):
        store += rain[i]
        if store > cap:
            runoff += store - cap
            store = cap
        store -= loss[i]
        if store < 0:
            irrigation += cap - store
            store = cap
            events += 1

    def count(arr, a, b, cond):
        if pd.isna(a) or pd.isna(b):
            return 0
        seg = arr[int(a):int(b)]
        return int(cond(seg).sum())

    heat = count(tmax, c["heat_day_from"], c["heat_day_to"], lambda s: s >= c["heat_threshold_c"])
    cold = count(tmin, c["cold_day_from"], c["cold_day_to"], lambda s: s <= c["cold_threshold_c"]) \
        if not pd.isna(c["cold_threshold_c"]) else 0
    wet = count(rain, c["rain_day_from"], c["rain_day_to"], lambda s: s >= C.HEAVY_RAIN_MM)
    return {
        "etc_mm": float(etc.sum()), "rain_mm": float(rain.sum()), "irrigation_mm": irrigation,
        "irrigation_events": events, "excess_rain_mm": runoff,
        "heat_days": heat, "cold_days": cold, "heavy_rain_days": wet,
        "tmax_mean": float(np.nanmean(tmax)),
        "soil_root": float(wx["GWETROOT"].mean()) if "GWETROOT" in wx else np.nan,
    }


def season_dates(slot: Slot, year: int) -> tuple[pd.Timestamp, pd.Timestamp]:
    offset = (slot.sow - dt.date(REF_YEAR, 1, 1)).days
    start = pd.Timestamp(year, 1, 1) + pd.Timedelta(days=offset)
    dur = (slot.harvest - slot.sow).days
    return start, start + pd.Timedelta(days=dur - 1)


def simulate_rotation(sch: Schedule, crops: pd.DataFrame, daily: pd.DataFrame,
                      texture: str) -> pd.DataFrame:
    """Simulate every crop of the rotation for every cycle-year that the data fully covers."""
    d = daily.set_index("date")
    first_year, last_date = d.index.min().year, d.index.max()
    rows = []
    for y in range(first_year, last_date.year + 1):
        for k, slot in enumerate(sch.slots):
            start, end = season_dates(slot, y)
            if start < d.index.min() or end > last_date:
                continue
            wx = d.loc[start:end]
            if wx["T2M"].isna().any() or len(wx) < (end - start).days:
                continue
            res = simulate_season(crops.loc[slot.crop_id], wx, texture)
            res.update({"cycle_year": y, "crop_id": slot.crop_id, "order": k, "season_start": start})
            rows.append(res)
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    # keep only cycle-years where every crop could be simulated
    full = df.groupby("cycle_year")["crop_id"].count()
    keep = full[full == len(sch.slots)].index
    return df[df["cycle_year"].isin(keep)]


# --------------------------------------------------------------------------- scoring
@dataclass
class Evaluation:
    crop_ids: list[str]
    label: str
    schedule: Schedule
    scores: dict
    total: float
    per_crop: pd.DataFrame
    per_year: pd.DataFrame
    water_mm: float
    water_range: tuple
    evidence: list[str]
    benefits: list[str]
    risks: list[str]
    gaps: list[str]
    confidence: str
    factor_notes: dict
    bare_cover_pct: float | None
    baseline_years: list[int]
    gates: list = field(default_factory=list)


def _clip(x):
    return float(np.clip(x, 0, 100))


def evaluate_rotation(crop_ids: list[str], profile: dict, daily: pd.DataFrame,
                      crops: pd.DataFrame, ndvi_low_doys: set[int] | None = None,
                      data_status: dict | None = None) -> Evaluation:
    data_status = data_status or {}
    problem = validate_rotation(list(crop_ids), crops)
    if problem:
        raise ValueError(problem)
    texture = profile.get("soil_texture", "loam")
    sch = schedule_rotation(crop_ids, crops)
    sim_all = simulate_rotation(sch, crops, daily, texture)
    years = sorted(sim_all["cycle_year"].unique())[-C.BASELINE_YEARS:] if not sim_all.empty else []
    sim = sim_all[sim_all["cycle_year"].isin(years)]
    names = {c: crops.loc[c, "name"].split(" (")[0] for c in crop_ids}
    notes, evidence, benefits, risks, gaps, gates = {}, [], [], [], [], []

    per_crop = sim.groupby("crop_id").agg(
        irrigation_mm=("irrigation_mm", "mean"), irrigation_min=("irrigation_mm", "min"),
        irrigation_max=("irrigation_mm", "max"), etc_mm=("etc_mm", "mean"),
        rain_mm=("rain_mm", "mean"), heat_days=("heat_days", "mean"),
        cold_days=("cold_days", "mean"), heavy_rain_days=("heavy_rain_days", "mean"),
        tmax_mean=("tmax_mean", "mean"),
    ).reindex(crop_ids) if not sim.empty else pd.DataFrame(index=crop_ids)
    per_year = sim.groupby("cycle_year").agg(irrigation_mm=("irrigation_mm", "sum"),
                                             heat_days=("heat_days", "sum")).reset_index() \
        if not sim.empty else pd.DataFrame()

    # ---------------- water
    water = float(per_crop["irrigation_mm"].sum()) if not sim.empty else np.nan
    wr = (float(per_year["irrigation_mm"].min()), float(per_year["irrigation_mm"].max())) \
        if not per_year.empty else (np.nan, np.nan)
    s_water = _clip(100 * (1 - water / WATER_SCORE_MAX_MM)) if not np.isnan(water) else 50
    irrigation = profile.get("irrigation", "Canal + tubewell")
    avail = profile.get("water_availability", "Moderate")
    supply = 0 if irrigation == "Rainfed" else WATER_SUPPLY_MM.get(avail, 1000)
    if not np.isnan(water) and water > supply:
        pen = 40 if supply == 0 else min(40, 40 * (water - supply) / supply)
        s_water = _clip(s_water - pen)
        risks.append(f"Estimated net irrigation need (~{water:.0f} mm/yr) is above what Field Shift "
                     f"assumes a '{avail if supply else 'rainfed'}' water supply can deliver (~{supply} mm/yr).")
    notes["water"] = (f"≈ {water:.0f} mm net irrigation per year "
                      f"(≈ {water / C.IRRIGATION_DEPTH_MM:.0f} irrigations of 3 inches); "
                      f"range {wr[0]:.0f}–{wr[1]:.0f} mm over {len(years)} years.") if not np.isnan(water) else "No data"
    for c in crop_ids:
        if c in per_crop.index and not np.isnan(per_crop.loc[c, "irrigation_mm"]):
            r = per_crop.loc[c]
            evidence.append(f"**{names[c]}**: crop water use ≈ {r['etc_mm']:.0f} mm, NASA POWER rain in "
                            f"season ≈ {r['rain_mm']:.0f} mm → net irrigation ≈ {r['irrigation_mm']:.0f} mm "
                            f"(range {r['irrigation_min']:.0f}–{r['irrigation_max']:.0f}).")

    # ---------------- soil health
    fam = {crops.loc[c, "family"] for c in crop_ids}
    s_soil, soil_bits = 60.0, []
    legumes = [c for c in crop_ids if crops.loc[c, "legume"] == "yes"]
    if legumes:
        s_soil += 25 + 5 * (len(legumes) - 1)
        soil_bits.append("+ legume fixes nitrogen")
        benefits.append(f"Includes {', '.join(names[c] for c in legumes)}, a legume that can add biologically "
                        f"fixed nitrogen and break cereal pest/disease cycles.")
    if len(fam) >= 3:
        s_soil += 10; soil_bits.append("+ three crop families")
    elif len(fam) == 2:
        s_soil += 5; soil_bits.append("+ two crop families")
    if fam == {"cereal"}:
        s_soil -= 10; soil_bits.append("− cereals only")
    if any(crops.loc[c, "puddled"] == "yes" for c in crop_ids):
        s_soil -= 15; soil_bits.append("− puddling damages soil structure")
        risks.append("Puddled rice can form a compacted plough pan that makes the following wheat harder to establish.")
    if any(crops.loc[c, "residue_burning_risk"] == "yes" for c in crop_ids):
        if profile.get("burns_residue", True):
            s_soil -= 15; soil_bits.append("− residue burning")
            risks.append("Burning rice straw removes organic matter and contributes to smog; "
                         "consider incorporation, mulching or a happy-seeder.")
        else:
            soil_bits.append("residue retained (no burning)")
    bare_pen = 30 * sch.bare_days / 365
    s_soil -= bare_pen
    soil_bits.append(f"− {sch.bare_days} bare days")
    s_soil = _clip(s_soil)
    notes["soil"] = "; ".join(soil_bits)

    # NDVI cross-check: how much of the observed bare window would be under a crop?
    bare_cover = None
    if ndvi_low_doys:
        cov = covered_doys(sch)
        bare_cover = 100 * len(cov & ndvi_low_doys) / len(ndvi_low_doys)

    # ---------------- climate resilience
    crop_climate, clim_bits = [], []
    for c in crop_ids:
        if c not in per_crop.index or np.isnan(per_crop.loc[c].get("heat_days", np.nan)):
            continue
        cr, r = crops.loc[c], per_crop.loc[c]
        slot = next(s for s in sch.slots if s.crop_id == c)
        heat_len = max(1, cr["heat_day_to"] - cr["heat_day_from"])
        cold_len = max(1, (cr["cold_day_to"] - cr["cold_day_from"])) if not pd.isna(cr["cold_day_from"]) else 1
        heat_frac = r["heat_days"] / heat_len
        cs = 100 - 70 * heat_frac - 100 * (r["cold_days"] / cold_len) - 15 * r["heavy_rain_days"]
        crop_climate.append(_clip(cs))
        per_crop.loc[c, "climate_score"] = _clip(cs)
        per_crop.loc[c, "heat_frac"] = heat_frac
        if r["heat_days"] >= 0.5:
            a = slot.sow + dt.timedelta(days=int(cr["heat_day_from"]))
            b = slot.sow + dt.timedelta(days=int(cr["heat_day_to"]))
            msg = (f"{names[c]}: max temperature ≥ {cr['heat_threshold_c']:.0f} °C on "
                   f"{r['heat_days']:.1f} of {heat_len:.0f} days during {cr['heat_stage']} ({fmt(a)}–{fmt(b)}).")
            clim_bits.append(f"{names[c]} heat {r['heat_days']:.0f}/{heat_len:.0f} d")
            evidence.append("NASA POWER — " + msg)
            if heat_frac >= 0.25:
                risks.append(msg + " Heat at this stage can reduce grain/pod set.")
        if r["heavy_rain_days"] >= 0.3:
            a = slot.sow + dt.timedelta(days=int(cr["rain_day_from"]))
            b = slot.sow + dt.timedelta(days=int(cr["rain_day_to"]))
            msg = (f"{names[c]}: {r['heavy_rain_days']:.1f} heavy-rain days (≥ {C.HEAVY_RAIN_MM:.0f} mm) per season "
                   f"during {cr['rain_sensitive_stage']} ({fmt(a)}–{fmt(b)}).")
            evidence.append("NASA POWER — " + msg)
            clim_bits.append(f"{names[c]} heavy rain {r['heavy_rain_days']:.1f} d")
            if r["heavy_rain_days"] >= 0.6:
                risks.append(msg)
        if r["cold_days"] >= 0.5:
            clim_bits.append(f"{names[c]} frost {r['cold_days']:.1f} d")
            risks.append(f"{names[c]}: {r['cold_days']:.1f} frost days per season at a sensitive stage.")
    # trend: are heat days in sensitive windows increasing across the full record?
    if not sim_all.empty:
        yearly = sim_all.groupby("cycle_year")["heat_days"].sum()
        if len(yearly) >= 10:
            slope = np.polyfit(yearly.index, yearly.values, 1)[0] * 10
            if slope >= 1:
                clim_bits.append(f"heat days rising {slope:+.1f}/decade")
                risks.append(f"Heat days in this rotation's sensitive stages have been rising "
                             f"(~{slope:+.1f} days per decade since {yearly.index.min()}).")
    s_climate = float(np.mean(crop_climate)) if crop_climate else 50.0
    if any("heat days rising" in b for b in clim_bits):
        s_climate = _clip(s_climate - 5)
    notes["climate"] = "; ".join(clim_bits) if clim_bits else "Few stress days in sensitive stages"

    # ---------------- soil & salinity fit
    ece = profile.get("ece")
    ece_used = S.ASSUMED_ECE if ece is None else ece
    if ece is None:
        gaps.append("Soil salinity (ECe) has not been tested — Field Shift assumed a normal value. "
                    "A lab soil test would make the soil-fit score reliable.")
    fits, fit_bits = [], []
    for c in crop_ids:
        cr = crops.loc[c]
        tex, tex_lbl = S.texture_fit(cr, texture)
        yp = S.salinity_yield_potential(ece_used, cr["ece_threshold"], cr["ece_slope"])
        f = 0.5 * tex + 0.5 * yp
        if profile.get("waterlogging") and cr["waterlog_sensitive"] == "yes":
            f -= 30
            risks.append(f"{names[c]} is sensitive to standing water, and you reported waterlogging after heavy rain.")
        if yp < 90:
            risks.append(f"At ECe ≈ {ece_used:.0f} dS/m, {names[c]} may lose ~{100 - yp:.0f}% of potential yield "
                         f"(FAO-29 threshold {cr['ece_threshold']} dS/m).")
        zone = profile.get("zone")
        zones = str(cr.get("recommended_zones", "")).split(";")
        zone_txt = ""
        if zone and zone not in zones:
            f -= 45
            zone_txt = f", not a recommended crop in the {zone}"
            gates.append(f"{names[c]} is outside its recommended zone ({zone})")
            risks.append(f"{names[c]} is not normally grown in the {zone} (Punjab agro-ecological zoning) — "
                         f"local climate, pests, ginning/milling and buyers may be missing.")
        fits.append(np.clip(f, 0, 100))
        fit_bits.append(f"{names[c]}: {texture} {tex_lbl}, salinity yield potential {yp:.0f}%{zone_txt}")
    if not profile.get("zone"):
        gaps.append("Your agro-ecological zone is unknown (custom location) — regional crop suitability was not checked.")
    s_soilfit = float(np.mean(fits))
    notes["soilfit"] = "; ".join(fit_bits)

    # ---------------- calendar fit
    late_total = sum(s.late_days for s in sch.slots) + sch.first_crop_late
    s_cal = 0.0 if not sch.feasible else _clip(100 - 2.5 * late_total)
    risks.extend(sch.issues)
    notes["calendar"] = ("Does not fit in one year" if not sch.feasible else
                         f"{late_total} days of late sowing in total" if late_total else "All crops sown inside recommended windows")

    # ---------------- market
    mk = profile.get("market", {})
    vals, mk_bits = [], []
    for c in crop_ids:
        v = mk.get(c, "Unknown")
        vals.append({"Yes": 100, "Unknown": 60, "No": 10}.get(v, 60))
        mk_bits.append(f"{names[c]}: {v.lower()}")
        if v == "No":
            risks.append(f"You reported no reliable local market for {names[c]}.")
        elif v == "Unknown":
            gaps.append(f"Market access for {names[c]} is unknown — check buyers / procurement before switching.")
    s_market = float(np.mean(vals))
    notes["market"] = "; ".join(mk_bits)

    scores = {"water": s_water, "soil": s_soil, "climate": s_climate,
              "soilfit": s_soilfit, "calendar": s_cal, "market": s_market}
    w = profile.get("weights", {k: 1 for k in FACTORS})
    wsum = sum(w.values()) or 1
    total = sum(scores[k] * w.get(k, 0) for k in FACTORS) / wsum
    if not sch.feasible:
        gates.append("the crop sequence does not fit into one year")
    if gates:  # hard constraints: a weighted average must not hide a deal-breaker
        total *= 0.7

    # ---------------- confidence & gaps
    conf_pts = 0
    conf_pts += 1 if not sim.empty and len(years) >= 8 else 0
    conf_pts += 1 if data_status.get("ndvi") else 0
    conf_pts += 1 if ece is not None else 0
    conf_pts += 1 if all(mk.get(c, "Unknown") != "Unknown" for c in crop_ids) else 0
    conf_pts += 1 if data_status.get("smap") else 0
    confidence = "High" if conf_pts >= 4 else "Medium" if conf_pts >= 2 else "Low"
    if not data_status.get("smap"):
        gaps.append("Soil moisture comes from the POWER/MERRA-2 model; NASA SMAP satellite data has not been added yet.")
    bias = data_status.get("imerg_bias_pct")
    if bias is None:
        gaps.append("Rainfall comes from NASA POWER only; it has not been cross-checked against GPM IMERG "
                    "satellite rainfall for this location.")
    elif abs(bias) > C.RAIN_BIAS_WARN_PCT:
        gaps.append(f"NASA POWER rainfall here is {abs(bias):.0f}% {'higher' if bias > 0 else 'lower'} than GPM IMERG "
                    f"satellite rainfall, so the irrigation estimates may be "
                    f"{'too low' if bias > 0 else 'too high'}.")
    if any(crops.loc[c, "puddled"] == "yes" for c in crop_ids):
        gaps.append(f"Rice water need depends strongly on seepage/percolation; Field Shift assumed "
                    f"{S.RICE_PERCOLATION.get(texture, 3)} mm/day for {texture} soil.")
    gaps.append("Crop calendars and thresholds are regional guidance — confirm with your local "
                "agriculture extension officer for your variety.")

    if sch.bare_days < 60:
        benefits.append(f"Keeps the field covered most of the year (only ~{sch.bare_days} bare days).")

    return Evaluation(crop_ids=list(crop_ids), label=rotation_label(crop_ids, crops), schedule=sch,
                      scores=scores, total=total, per_crop=per_crop.reset_index(), per_year=per_year,
                      water_mm=water, water_range=wr, evidence=evidence, benefits=benefits,
                      risks=list(dict.fromkeys(risks)), gaps=list(dict.fromkeys(gaps)),
                      confidence=confidence, factor_notes=notes, bare_cover_pct=bare_cover,
                      baseline_years=[int(y) for y in years], gates=gates)


def compare(evals: list[Evaluation], current: Evaluation) -> None:
    """Add comparison statements versus the farmer's current rotation (in place)."""
    for e in evals:
        if e is current:
            continue
        if not np.isnan(e.water_mm) and not np.isnan(current.water_mm):
            diff = e.water_mm - current.water_mm
            pct = 100 * diff / current.water_mm if current.water_mm else 0
            if diff < -50:
                e.benefits.insert(0, f"Needs an estimated **{abs(diff):.0f} mm less** net irrigation per year "
                                     f"than {current.label} ({pct:+.0f}%) ≈ {abs(diff) / C.IRRIGATION_DEPTH_MM:.0f} "
                                     f"fewer 3-inch irrigations.")
            elif diff > 50:
                e.risks.insert(0, f"Needs an estimated **{diff:.0f} mm more** net irrigation per year than "
                                  f"{current.label} ({pct:+.0f}%).")
        bd = current.schedule.bare_days - e.schedule.bare_days
        if bd > 15:
            e.benefits.append(f"Covers about **{bd} more days** of otherwise bare soil than {current.label}.")
        if e.bare_cover_pct is not None and current.bare_cover_pct is not None \
                and e.bare_cover_pct - current.bare_cover_pct > 20:
            e.benefits.append(f"MODIS NDVI shows a recurring low-vegetation window at this location; this rotation "
                              f"puts a crop on {e.bare_cover_pct:.0f}% of it (current: {current.bare_cover_pct:.0f}%).")

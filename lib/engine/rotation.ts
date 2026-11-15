/** Port of pipeline/src/rotation_engine.py — scheduling, daily season simulation, six-factor scoring. */
import type { Daily } from "./weather";
import {
  FACTORS, type Crop, type DataStatus, type Evaluation, type Fact, type Factor, type Knowledge,
  type PerCrop, type Profile, type Schedule, type SeasonResult,
} from "./types";
import { clip, dayOf, doyOf, isNum, linspace, mean, mmdd, polyfit1, roundHalfEven, ymd } from "./util";

export const REF_YEAR = 2021;

const nanOrNull = (x: number | null | undefined) => x === null || x === undefined || Number.isNaN(x);

// --------------------------------------------------------------------------- validation
export function validateRotation(ids: string[], K: Knowledge): Fact | null {
  if (ids.length < 2) return { k: "rotation_too_short" };
  const unknown = ids.filter((c) => !K.crops[c]);
  if (unknown.length) return { k: "rotation_unknown_crop", crops: unknown };
  const reps = [...new Set(ids.filter((c, i) => ids.indexOf(c) !== i))];
  if (reps.length) return { k: "rotation_repeat", crops: reps };
  return null;
}

// --------------------------------------------------------------------------- schedule
function windowOf(c: Crop, year: number): [number, number] {
  return [mmdd(c.sow_start, year), mmdd(c.sow_end, year)];
}

export function scheduleRotation(ids: string[], K: Knowledge): Schedule {
  const C = K.constants;
  const sch: Schedule = { crops: [...ids], slots: [], feasible: true, firstCropLate: 0, bareDays: 0, barePeriods: [], issues: [] };
  const first = K.crops[ids[0]];
  const [ws, we] = windowOf(first, REF_YEAR);
  const t0 = ws + roundHalfEven((we - ws) * 0.3);
  let prevHarvest = 0;
  ids.forEach((cid, i) => {
    const c = K.crops[cid];
    const dur = Math.trunc(c.duration_days);
    let sow = 0;
    let late = 0;
    let win: [number, number] = [ws, we];
    if (i === 0) {
      sow = t0;
    } else {
      const earliest = prevHarvest + C.TURNAROUND_DAYS;
      const ey = ymd(earliest).y;
      let found = false;
      for (let y = ey - 1; y <= ey + 1; y++) {
        const [a, b] = windowOf(c, y);
        if (b + C.MAX_LATE_DAYS >= earliest) {
          sow = Math.max(earliest, a);
          late = Math.max(0, sow - b);
          win = [a, b];
          found = true;
          break;
        }
      }
      if (!found) throw new Error(`No sowing window found for ${cid}`);
    }
    const harvest = sow + dur;
    sch.slots.push({ crop: cid, sow, harvest, late, window: win });
    if (late > 0) sch.issues.push({ k: "late_sowing", crop: cid, days: late, from: win[0], to: win[1] });
    prevHarvest = harvest;
  });
  const cycleEnd = t0 + 365;
  const need = prevHarvest + C.TURNAROUND_DAYS - cycleEnd;
  const slack = we - t0;
  if (need > 0) {
    sch.firstCropLate = Math.max(0, need - slack);
    if (sch.firstCropLate > C.MAX_LATE_DAYS || need > slack + C.MAX_LATE_DAYS) {
      sch.feasible = false;
      sch.issues.push({ k: "does_not_fit", days: 365 + need, crop: ids[0] });
    } else if (sch.firstCropLate > 0) {
      sch.issues.push({ k: "first_crop_late", crop: ids[0], days: sch.firstCropLate });
    }
  }
  sch.slots.forEach((s, i) => {
    const next = i + 1 < sch.slots.length ? sch.slots[i + 1].sow : cycleEnd;
    if (next - s.harvest > 0) sch.barePeriods.push([s.harvest, next]);
  });
  sch.bareDays = Math.max(0, 365 - ids.reduce((a, c) => a + Math.trunc(K.crops[c].duration_days), 0));
  return sch;
}

export function coveredDoys(sch: Schedule): Set<number> {
  const days = new Set<number>();
  for (const s of sch.slots) for (let t = s.sow; t < s.harvest; t++) days.add(doyOf(t));
  return days;
}

// --------------------------------------------------------------------------- simulation
export function kcCurve(c: Crop, n: number): number[] {
  const fr = [c.f_ini, c.f_dev, c.f_mid, c.f_late];
  const tot = fr.reduce((a, b) => a + b, 0);
  const L = fr.map((f) => roundHalfEven((f / tot) * n));
  L[3] = n - (L[0] + L[1] + L[2]);
  const out = [
    ...new Array(Math.max(0, L[0])).fill(c.kc_ini),
    ...linspace(c.kc_ini, c.kc_mid, L[1], false),
    ...new Array(Math.max(0, L[2])).fill(c.kc_mid),
    ...linspace(c.kc_mid, c.kc_end, L[3], true),
  ];
  return out.slice(0, n);
}

function countIn(arr: Float64Array, a: number | null, b: number | null, cond: (v: number) => boolean): number {
  if (nanOrNull(a) || nanOrNull(b)) return 0;
  const lo = Math.max(0, Math.trunc(a as number));
  const hi = Math.min(arr.length, Math.trunc(b as number));
  let n = 0;
  for (let i = lo; i < hi; i++) if (cond(arr[i])) n++;
  return n;
}

export function simulateSeason(c: Crop, d: Daily, a: number, b: number, texture: string, K: Knowledge) {
  const C = K.constants;
  const n = b - a + 1;
  const kc = kcCurve(c, n);
  const et0 = d.col.ET0.subarray(a, b + 1);
  const rain = d.col.PRECTOTCORR.subarray(a, b + 1);
  const tmax = d.col.T2M_MAX.subarray(a, b + 1);
  const tmin = d.col.T2M_MIN.subarray(a, b + 1);
  const puddled = String(c.puddled) === "yes";
  let cap: number;
  let perc = 0;
  let irrigation: number;
  if (puddled) {
    cap = Number(c.bucket_mm);
    perc = C.RICE_PERCOLATION[texture] ?? Number(c.percolation_mm_day);
    irrigation = Number(c.land_prep_mm);
  } else {
    cap = Number(C.BUCKET_MM[texture] ?? c.bucket_mm);
    irrigation = 0;
  }
  let store = cap * 0.5;
  let events = 0;
  let runoff = 0;
  let etcSum = 0;
  let rainSum = 0;
  for (let i = 0; i < n; i++) {
    const etc = kc[i] * et0[i];
    etcSum += etc;
    rainSum += rain[i];
    store += rain[i];
    if (store > cap) {
      runoff += store - cap;
      store = cap;
    }
    store -= puddled ? etc + perc : etc;
    if (store < 0) {
      irrigation += cap - store;
      store = cap;
      events++;
    }
  }
  const heat = countIn(tmax, c.heat_day_from, c.heat_day_to, (v) => v >= c.heat_threshold_c);
  const cold = nanOrNull(c.cold_threshold_c) ? 0 : countIn(tmin, c.cold_day_from, c.cold_day_to, (v) => v <= (c.cold_threshold_c as number));
  const heavy = countIn(rain, c.rain_day_from, c.rain_day_to, (v) => v >= C.HEAVY_RAIN_MM);
  return {
    etc: etcSum, rain: rainSum, irrigation, irrigationEvents: events, excessRain: runoff,
    heat, cold, heavy, tmaxMean: mean(tmax), soilRoot: mean(d.col.GWETROOT.subarray(a, b + 1)),
  };
}

export function simulateRotation(sch: Schedule, d: Daily, texture: string, K: Knowledge): SeasonResult[] {
  const firstDay = d.day[0];
  const lastDay = d.day[d.n - 1];
  const firstYear = ymd(firstDay).y;
  const lastYear = ymd(lastDay).y;
  const ref = dayOf(REF_YEAR, 1, 1);
  const rows: SeasonResult[] = [];
  for (let y = firstYear; y <= lastYear; y++) {
    sch.slots.forEach((slot, k) => {
      const start = dayOf(y, 1, 1) + (slot.sow - ref);
      const end = start + (slot.harvest - slot.sow) - 1;
      if (start < firstDay || end > lastDay) return;
      const a = start - firstDay;
      const b = end - firstDay;
      for (let i = a; i <= b; i++) if (Number.isNaN(d.col.T2M[i])) return;
      const r = simulateSeason(K.crops[slot.crop], d, a, b, texture, K);
      rows.push({ cycleYear: y, crop: slot.crop, order: k, seasonStart: start, ...r });
    });
  }
  const perYear = new Map<number, number>();
  for (const r of rows) perYear.set(r.cycleYear, (perYear.get(r.cycleYear) ?? 0) + 1);
  return rows.filter((r) => perYear.get(r.cycleYear) === sch.slots.length);
}

// --------------------------------------------------------------------------- scoring
export function salinityYieldPotential(ece: number, threshold: number, slope: number): number {
  if (ece <= threshold) return 100;
  return Math.max(0, 100 - slope * (ece - threshold));
}

export function textureFit(c: Crop, texture: string): [number, "good" | "ok" | "poor"] {
  if (String(c.textures_good).split(";").includes(texture)) return [100, "good"];
  if (String(c.textures_ok).split(";").includes(texture)) return [70, "ok"];
  return [35, "poor"];
}

export function evaluateRotation(
  ids: string[], profile: Profile, d: Daily, K: Knowledge, ndviLowDoys: Set<number> | null = null,
  status: DataStatus = { ndvi: false, smap: false, imergBiasPct: null },
): Evaluation {
  const C = K.constants;
  const problem = validateRotation(ids, K);
  if (problem) throw Object.assign(new Error(problem.k), { fact: problem });
  const texture = profile.soilTexture ?? "loam";
  const sch = scheduleRotation(ids, K);
  const simAll = simulateRotation(sch, d, texture, K);
  const allYears = [...new Set(simAll.map((r) => r.cycleYear))].sort((a, b) => a - b);
  const years = allYears.slice(-C.BASELINE_YEARS);
  const yearSet = new Set(years);
  const sim = simAll.filter((r) => yearSet.has(r.cycleYear));
  const notes = Object.fromEntries(FACTORS.map((f) => [f, [] as Fact[]])) as Record<Factor, Fact[]>;
  const evidence: Fact[] = [];
  const benefits: Fact[] = [];
  const risks: Fact[] = [];
  const gaps: Fact[] = [];
  const gates: Fact[] = [];

  const perCrop: PerCrop[] = ids.map((cid) => {
    const rs = sim.filter((r) => r.crop === cid);
    const irr = rs.map((r) => r.irrigation);
    return {
      crop: cid,
      irrigation: mean(irr), irrigationMin: irr.length ? Math.min(...irr) : NaN, irrigationMax: irr.length ? Math.max(...irr) : NaN,
      etc: mean(rs.map((r) => r.etc)), rain: mean(rs.map((r) => r.rain)), heat: mean(rs.map((r) => r.heat)),
      cold: mean(rs.map((r) => r.cold)), heavy: mean(rs.map((r) => r.heavy)), tmaxMean: mean(rs.map((r) => r.tmaxMean)),
      climate: null, heatFrac: null,
    };
  });
  const pc = (cid: string) => perCrop.find((p) => p.crop === cid)!;
  const perYear = years.map((y) => {
    const rs = sim.filter((r) => r.cycleYear === y);
    return { cycleYear: y, irrigation: rs.reduce((a, r) => a + r.irrigation, 0), heat: rs.reduce((a, r) => a + r.heat, 0) };
  });

  // ---------------- water
  const water = sim.length ? perCrop.reduce((a, p) => a + (Number.isNaN(p.irrigation) ? 0 : p.irrigation), 0) : NaN;
  const waterRange: [number, number] = perYear.length
    ? [Math.min(...perYear.map((p) => p.irrigation)), Math.max(...perYear.map((p) => p.irrigation))]
    : [NaN, NaN];
  let sWater = !Number.isNaN(water) ? clip(100 * (1 - water / C.WATER_SCORE_MAX_MM)) : 50;
  const supply = profile.irrigation === "Rainfed" ? 0 : (C.WATER_SUPPLY_MM[profile.waterAvailability] ?? 1000);
  if (!Number.isNaN(water) && water > supply) {
    const pen = supply === 0 ? 40 : Math.min(40, (40 * (water - supply)) / supply);
    sWater = clip(sWater - pen);
    risks.push({ k: "water_over_supply", need: water, supply, availability: supply ? profile.waterAvailability : "Rainfed" });
  }
  if (!Number.isNaN(water)) {
    notes.water.push({ k: "note_water", water, irrigations: water / C.IRRIGATION_DEPTH_MM, lo: waterRange[0], hi: waterRange[1], years: years.length });
  }
  for (const c of ids) {
    const r = pc(c);
    if (!Number.isNaN(r.irrigation)) {
      evidence.push({ k: "ev_water", crop: c, etc: r.etc, rain: r.rain, irrigation: r.irrigation, lo: r.irrigationMin, hi: r.irrigationMax });
    }
  }

  // ---------------- soil health
  const fam = new Set(ids.map((c) => K.crops[c].family));
  let sSoil = 60;
  const legumes = ids.filter((c) => K.crops[c].legume === "yes");
  if (legumes.length) {
    sSoil += 25 + 5 * (legumes.length - 1);
    notes.soil.push({ k: "note_legume" });
    benefits.push({ k: "legume", crops: legumes });
  }
  if (fam.size >= 3) {
    sSoil += 10;
    notes.soil.push({ k: "note_families", n: 3 });
  } else if (fam.size === 2) {
    sSoil += 5;
    notes.soil.push({ k: "note_families", n: 2 });
  }
  if (fam.size === 1 && fam.has("cereal")) {
    sSoil -= 10;
    notes.soil.push({ k: "note_cereals_only" });
  }
  if (ids.some((c) => K.crops[c].puddled === "yes")) {
    sSoil -= 15;
    notes.soil.push({ k: "note_puddling" });
    risks.push({ k: "puddled" });
  }
  if (ids.some((c) => K.crops[c].residue_burning_risk === "yes")) {
    if (profile.burnsResidue ?? true) {
      sSoil -= 15;
      notes.soil.push({ k: "note_burning" });
      risks.push({ k: "burning" });
    } else {
      notes.soil.push({ k: "note_residue_kept" });
    }
  }
  sSoil -= (30 * sch.bareDays) / 365;
  notes.soil.push({ k: "note_bare_days", days: sch.bareDays });
  sSoil = clip(sSoil);

  let bareCover: number | null = null;
  if (ndviLowDoys && ndviLowDoys.size) {
    const cov = coveredDoys(sch);
    let hit = 0;
    for (const x of cov) if (ndviLowDoys.has(x)) hit++;
    bareCover = (100 * hit) / ndviLowDoys.size;
  }

  // ---------------- climate resilience
  const cropClimate: number[] = [];
  for (const c of ids) {
    const r = pc(c);
    if (Number.isNaN(r.heat)) continue;
    const cr = K.crops[c];
    const slot = sch.slots.find((s) => s.crop === c)!;
    const heatLen = Math.max(1, cr.heat_day_to - cr.heat_day_from);
    const coldLen = !nanOrNull(cr.cold_day_from) ? Math.max(1, (cr.cold_day_to as number) - (cr.cold_day_from as number)) : 1;
    const heatFrac = r.heat / heatLen;
    const cs = 100 - 70 * heatFrac - 100 * (r.cold / coldLen) - 15 * r.heavy;
    cropClimate.push(clip(cs));
    r.climate = clip(cs);
    r.heatFrac = heatFrac;
    if (r.heat >= 0.5) {
      const f: Fact = { k: "heat", crop: c, days: r.heat, of: heatLen, t: cr.heat_threshold_c, stage: cr.heat_stage,
        from: slot.sow + Math.trunc(cr.heat_day_from), to: slot.sow + Math.trunc(cr.heat_day_to) };
      notes.climate.push({ k: "note_heat", crop: c, days: r.heat, of: heatLen });
      evidence.push({ ...f, k: "ev_heat" });
      if (heatFrac >= 0.25) risks.push(f);
    }
    if (r.heavy >= 0.3) {
      const f: Fact = { k: "heavyrain", crop: c, days: r.heavy, mm: C.HEAVY_RAIN_MM, stage: cr.rain_sensitive_stage,
        from: slot.sow + Math.trunc(cr.rain_day_from ?? 0), to: slot.sow + Math.trunc(cr.rain_day_to ?? 0) };
      evidence.push({ ...f, k: "ev_heavyrain" });
      notes.climate.push({ k: "note_heavyrain", crop: c, days: r.heavy });
      if (r.heavy >= 0.6) risks.push(f);
    }
    if (r.cold >= 0.5) {
      notes.climate.push({ k: "note_frost", crop: c, days: r.cold });
      risks.push({ k: "frost", crop: c, days: r.cold });
    }
  }
  let heatRising = false;
  if (simAll.length) {
    const byYear = new Map<number, number>();
    for (const r of simAll) byYear.set(r.cycleYear, (byYear.get(r.cycleYear) ?? 0) + r.heat);
    if (byYear.size >= 10) {
      const xs = [...byYear.keys()];
      const slope = polyfit1(xs, xs.map((y) => byYear.get(y)!))[0] * 10;
      if (slope >= 1) {
        heatRising = true;
        notes.climate.push({ k: "note_heat_rising", slope });
        risks.push({ k: "heattrend", slope, since: Math.min(...xs) });
      }
    }
  }
  let sClimate = cropClimate.length ? mean(cropClimate) : 50;
  if (heatRising) sClimate = clip(sClimate - 5);
  if (!notes.climate.length) notes.climate.push({ k: "note_few_stress" });

  // ---------------- soil & salinity fit
  const ece = profile.ece;
  const eceUsed = ece === null || ece === undefined ? C.ASSUMED_ECE : ece;
  if (ece === null || ece === undefined) gaps.push({ k: "gap_salinity" });
  const fits: number[] = [];
  for (const c of ids) {
    const cr = K.crops[c];
    const [tex, texLbl] = textureFit(cr, texture);
    const yp = salinityYieldPotential(eceUsed, cr.ece_threshold, cr.ece_slope);
    let f = 0.5 * tex + 0.5 * yp;
    if (profile.waterlogging && cr.waterlog_sensitive === "yes") {
      f -= 30;
      risks.push({ k: "waterlog", crop: c });
    }
    if (yp < 90) risks.push({ k: "salt", crop: c, loss: 100 - yp, ece: eceUsed, threshold: cr.ece_threshold });
    const zone = profile.zone;
    const zones = String(cr.recommended_zones ?? "").split(";");
    let outOfZone = false;
    if (zone && !zones.includes(zone)) {
      f -= 45;
      outOfZone = true;
      gates.push({ k: "gate_zone", crop: c, zone });
      risks.push({ k: "zone", crop: c, zone });
    }
    fits.push(clip(f));
    notes.soilfit.push({ k: "note_fit", crop: c, texture, fit: texLbl, yp, outOfZone, zone: outOfZone ? zone : null });
  }
  if (!profile.zone) gaps.push({ k: "gap_zone" });
  const sSoilfit = mean(fits);

  // ---------------- calendar fit
  const lateTotal = sch.slots.reduce((a, s) => a + s.late, 0) + sch.firstCropLate;
  const sCal = !sch.feasible ? 0 : clip(100 - 2.5 * lateTotal);
  risks.push(...sch.issues);
  notes.calendar.push(!sch.feasible ? { k: "note_no_fit" } : lateTotal ? { k: "note_late", days: lateTotal } : { k: "note_on_time" });

  // ---------------- market
  const mk = profile.market ?? {};
  const vals: number[] = [];
  for (const c of ids) {
    const v = mk[c] ?? "Unknown";
    vals.push(({ Yes: 100, Unknown: 60, No: 10 } as Record<string, number>)[v] ?? 60);
    notes.market.push({ k: "note_market", crop: c, answer: v });
    if (v === "No") risks.push({ k: "no_market", crop: c });
    else if (v === "Unknown") gaps.push({ k: "gap_market", crop: c });
  }
  const sMarket = mean(vals);

  const scores: Record<Factor, number> = { water: sWater, soil: sSoil, climate: sClimate, soilfit: sSoilfit, calendar: sCal, market: sMarket };
  const w = profile.weights ?? (Object.fromEntries(FACTORS.map((f) => [f, 1])) as Record<Factor, number>);
  const wsum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  let total = FACTORS.reduce((a, k) => a + scores[k] * (w[k] ?? 0), 0) / wsum;
  if (!sch.feasible) gates.push({ k: "gate_no_fit" });
  if (gates.length) total *= 0.7;

  // ---------------- confidence & gaps
  let confPts = 0;
  if (sim.length && years.length >= 8) confPts++;
  if (status.ndvi) confPts++;
  if (ece !== null && ece !== undefined) confPts++;
  if (ids.every((c) => (mk[c] ?? "Unknown") !== "Unknown")) confPts++;
  if (status.smap) confPts++;
  const confidence = confPts >= 4 ? "High" : confPts >= 2 ? "Medium" : "Low";
  if (!status.smap) gaps.push({ k: "gap_smap" });
  const bias = status.imergBiasPct;
  if (bias === null || bias === undefined) gaps.push({ k: "gap_imerg" });
  else if (Math.abs(bias) > C.RAIN_BIAS_WARN_PCT) gaps.push({ k: "gap_imerg_bias", bias });
  if (ids.some((c) => K.crops[c].puddled === "yes")) gaps.push({ k: "gap_percolation", mm: C.RICE_PERCOLATION[texture] ?? 3, texture });
  gaps.push({ k: "gap_regional" });
  if (sch.bareDays < 60) benefits.push({ k: "covered", days: sch.bareDays });

  return {
    crops: [...ids], schedule: sch, scores, total, perCrop, perYear, water, waterRange,
    evidence, benefits, risks: dedupe(risks), gaps: dedupe(gaps), confidence, notes, bareCover,
    baselineYears: years, gates,
  };
}

function dedupe(fs: Fact[]): Fact[] {
  const seen = new Set<string>();
  return fs.filter((f) => {
    const key = JSON.stringify(f);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Comparison statements versus the farmer's current rotation (mutates, like the Python engine). */
export function compare(evals: Evaluation[], current: Evaluation, K: Knowledge): void {
  for (const e of evals) {
    if (e === current) continue;
    if (!Number.isNaN(e.water) && !Number.isNaN(current.water)) {
      const diff = e.water - current.water;
      const pct = current.water ? (100 * diff) / current.water : 0;
      if (diff < -50) e.benefits.unshift({ k: "water_less", mm: -diff, pct, irrigations: -diff / K.constants.IRRIGATION_DEPTH_MM, current: current.crops });
      else if (diff > 50) e.risks.unshift({ k: "water_more", mm: diff, pct, current: current.crops });
    }
    const bd = current.schedule.bareDays - e.schedule.bareDays;
    if (bd > 15) e.benefits.push({ k: "more_cover", days: bd, current: current.crops });
    if (e.bareCover !== null && current.bareCover !== null && e.bareCover - current.bareCover > 20) {
      e.benefits.push({ k: "ndvi_cover", pct: e.bareCover, currentPct: current.bareCover });
    }
  }
}

export { isNum };

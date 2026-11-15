/* eslint-disable @typescript-eslint/no-explicit-any -- golden JSON fixtures produced by the Python pipeline */
/**
 * The TypeScript engine must reproduce the Python engine (pipeline/src) exactly.
 * tests/golden/*.json is produced by `python -m scripts.export_web_data` from the Python implementation.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  annualSummary, buildKnowledge, cleanNdvi, cleanPower, climatology, compare, completeYears, evaluateRotation,
  iso, lowVegetationWindows, ndviByMonth, ndviClimatology, outlook, rainCrosscheck, recentYears, scheduleRotation,
  seasonalPeaks, soilHealthProfile, stressMatrix, toMonthly, trends, windowDoys,
  type Evaluation, type KnowledgeJson, type NdviModel, type Profile,
} from "@/lib/engine";

const root = join(__dirname, "..");
const read = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));
const K = buildKnowledge(read("data/generated/knowledge.json") as KnowledgeJson);
const gold = read("tests/golden/engine.json");
const analysis = read("tests/golden/analysis.json");
const model = read("data/generated/ndvi_model.json") as NdviModel;
const districts: Record<string, any> = Object.fromEntries(K.regions.map((r) => [r.id, read(`data/generated/districts/${r.id}.json`)]));
const CUSTOM = [["wheat", "mungbean"], ["cotton", "wheat", "mungbean"], ["rice", "wheat", "maize"], ["mungbean", "rice", "wheat"], ["maize", "mungbean"]];

function close(a: number | null, b: number | null, path: string, tol = 1e-6) {
  const na = a === null || Number.isNaN(a as number);
  const nb = b === null || b === undefined || Number.isNaN(b as number);
  if (na || nb) {
    expect(na, `${path}: ts=${a} py=${b}`).toBe(nb);
    return;
  }
  expect(Math.abs((a as number) - (b as number)), `${path}: ts=${a} py=${b}`).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b as number)));
}

function profileOf(p: any): Profile {
  return {
    soilTexture: p.soil_texture, salinityClass: p.salinity_class, ece: p.ece, waterlogging: p.waterlogging, zone: p.zone,
    irrigation: p.irrigation, waterAvailability: p.water_availability, burnsResidue: p.burns_residue, market: p.market, weights: p.weights,
  };
}

describe("rotation engine matches the Python engine", () => {
  const dailyCache = new Map<string, ReturnType<typeof cleanPower>>();
  gold.cases.forEach((c: any, ci: number) => {
    it(`case ${ci}: ${c.region} temp+${c.temp} rain${c.rain}% zone=${c.profile.zone ?? "none"}`, () => {
      const dist = districts[c.region];
      const key = `${c.region}|${c.temp}|${c.rain}`;
      if (!dailyCache.has(key)) dailyCache.set(key, cleanPower(dist.power, dist.lat, K.constants, { temp: c.temp, rainPct: c.rain }));
      const daily = dailyCache.get(key)!;
      const low = c.useNdvi ? windowDoys(lowVegetationWindows(ndviClimatology(cleanNdvi(dist.ndvi))).windows) : null;
      const status = { ndvi: c.status.ndvi, smap: c.status.smap, imergBiasPct: c.status.imerg_bias_pct };
      const rots = [...K.rotations.map((r) => r.crops), ...CUSTOM];
      const evals: Evaluation[] = rots.map((ids) => evaluateRotation(ids, profileOf(c.profile), daily, K, low, status));
      const cur = evals.find((e) => e.crops.join() === c.current.join())!;
      compare(evals, cur, K);
      evals.forEach((e, i) => {
        const g = c.evals[i];
        const p = `${e.crops.join(">")}`;
        expect(e.crops).toEqual(g.crops);
        close(e.total, g.total, `${p}.total`);
        for (const f of Object.keys(g.scores)) close(e.scores[f as keyof typeof e.scores], g.scores[f], `${p}.scores.${f}`);
        close(e.water, g.water, `${p}.water`);
        close(e.waterRange[0], g.waterRange[0], `${p}.waterRange0`);
        close(e.waterRange[1], g.waterRange[1], `${p}.waterRange1`);
        expect(e.confidence, `${p}.confidence`).toBe(g.confidence);
        expect(e.gates.length, `${p}.gates`).toBe(g.nGates);
        close(e.bareCover, g.bareCover, `${p}.bareCover`);
        expect(e.baselineYears).toEqual(g.baselineYears);
        expect(e.schedule.feasible).toBe(g.schedule.feasible);
        expect(e.schedule.firstCropLate).toBe(g.schedule.firstCropLate);
        expect(e.schedule.bareDays).toBe(g.schedule.bareDays);
        expect(e.schedule.slots.map((s) => [s.crop, iso(s.sow), iso(s.harvest), s.late])).toEqual(
          g.schedule.slots.map((s: any) => [s.crop, s.sow, s.harvest, s.late]));
        e.perCrop.forEach((pc, j) => {
          const gp = g.perCrop[j];
          close(pc.irrigation, gp.irrigation, `${p}.${pc.crop}.irrigation`);
          close(pc.etc, gp.etc, `${p}.${pc.crop}.etc`);
          close(pc.rain, gp.rain, `${p}.${pc.crop}.rain`);
          close(pc.heat, gp.heat, `${p}.${pc.crop}.heat`);
          close(pc.cold, gp.cold, `${p}.${pc.crop}.cold`);
          close(pc.heavy, gp.heavy, `${p}.${pc.crop}.heavy`);
          close(pc.climate, gp.climate, `${p}.${pc.crop}.climate`);
        });
        expect(e.perYear.length).toBe(g.perYear.length);
        expect(e.risks.length, `${p}.nRisks`).toBe(g.nRisks);
        expect(e.benefits.length, `${p}.nBenefits`).toBe(g.nBenefits);
        expect(e.gaps.length, `${p}.nGaps`).toBe(g.nGaps);
      });
    });
  });
});

describe("climate, vegetation and soil-health analysis match Python", () => {
  for (const r of K.regions) {
    it(r.id, () => {
      const g = analysis[r.id];
      const dist = districts[r.id];
      const daily = cleanPower(dist.power, dist.lat, K.constants);
      const allYears = completeYears(daily);
      const years = recentYears(allYears, K.constants.BASELINE_YEARS);
      expect(years).toEqual(g.years);
      expect(allYears).toEqual(g.allYears);
      const monthly = toMonthly(daily);
      const clim = climatology(monthly, years);
      g.clim.forEach((gc: any, i: number) => {
        const tc = clim[i];
        close(tc.tmax, gc.tmax, `clim.${i}.tmax`);
        close(tc.tmin, gc.tmin, `clim.${i}.tmin`);
        close(tc.rain, gc.rain, `clim.${i}.rain`);
        close(tc.rainP10, gc.rain_p10, `clim.${i}.p10`);
        close(tc.rainP90, gc.rain_p90, `clim.${i}.p90`);
        close(tc.et0, gc.et0, `clim.${i}.et0`);
        close(tc.soilRoot, gc.soil_root, `clim.${i}.soil_root`);
        close(tc.hotDays, gc.hot_days, `clim.${i}.hot_days`);
        close(tc.waterBalance, gc.water_balance, `clim.${i}.wb`);
      });
      const annual = annualSummary(daily, allYears);
      g.annual.forEach((ga: any, i: number) => {
        close(annual[i].rain, ga.rain, `annual.${i}.rain`);
        close(annual[i].tmaxMean, ga.tmax_mean, `annual.${i}.tmax`);
        close(annual[i].wheatHeatDays, ga.wheat_heat_days, `annual.${i}.wheatheat`);
        close(annual[i].monsoonRain, ga.monsoon_rain, `annual.${i}.monsoon`);
      });
      const tr = trends(annual);
      const map: Record<string, keyof typeof tr> = { tmean: "tmean", tmax_mean: "tmaxMean", rain: "rain", hot_days: "hotDays", wheat_heat_days: "wheatHeatDays", monsoon_rain: "monsoonRain" };
      for (const [pk, tk] of Object.entries(map)) {
        close(tr[tk].perDecade, g.trends[pk].per_decade, `trend.${pk}.slope`);
        close(tr[tk].r2, g.trends[pk].r2, `trend.${pk}.r2`);
        close(tr[tk].earlyMean, g.trends[pk].early_mean, `trend.${pk}.early`);
        expect(tr[tk].earlyYears).toBe(g.trends[pk].early_years);
      }
      const nd = cleanNdvi(dist.ndvi);
      const nclim = ndviClimatology(nd);
      g.ndviClim.forEach((gc: any, i: number) => {
        close(nclim[i].ndvi, gc.ndvi, `ndvi.${i}`);
        close(nclim[i].p25, gc.p25, `ndvi.${i}.p25`);
        expect(nclim[i].month).toBe(gc.month);
      });
      const { windows, threshold } = lowVegetationWindows(nclim);
      close(threshold, g.threshold, "threshold");
      expect(windows.map((w) => [iso(w.start), iso(w.end), w.slots])).toEqual(g.windows.map((w: any) => [w.start, w.end, w.slots]));
      expect([...windowDoys(windows)].sort((a, b) => a - b)).toEqual(g.windowDoys);
      const stress = stressMatrix(clim, ndviByMonth(nclim), K.constants);
      const names: Record<string, string> = { heat: "Heat", deficit: "Water deficit", drysoil: "Dry soil", heavyrain: "Heavy rain", cold: "Cold", lowveg: "Low vegetation" };
      stress.forEach((s, i) => {
        for (const [tk, pk] of Object.entries(names)) {
          const cell = s.cells[tk as keyof typeof s.cells];
          expect(cell?.level ?? null, `stress.${s.month}.${tk}`).toBe(g.stress[i][pk] ?? null);
        }
      });
      const peaks = seasonalPeaks(nd);
      g.peaks.forEach((gp: any, i: number) => {
        close(peaks[i].rabiPeak, gp.rabi_peak, `peak.${i}.rabi`);
        close(peaks[i].kharifPeak, gp.kharif_peak, `peak.${i}.kharif`);
      });
      const im = dist.imerg ? dist.imerg.year.map((y: number, i: number) => ({ year: y, month: dist.imerg.month[i], mm: dist.imerg.mm[i] })) : null;
      const rc = rainCrosscheck(monthly, im, years, K.constants);
      if (g.crosscheck) {
        close(rc!.biasPct, g.crosscheck.bias_pct, "bias");
        close(rc!.rMonthly, g.crosscheck.r_monthly, "r");
        expect(rc!.nMonths).toBe(g.crosscheck.n_months);
        expect(rc!.agrees).toBe(g.crosscheck.agrees);
      }
      const o = outlook(model, r.id, nd)!;
      close(o.lastNdvi, g.outlook.lastNdvi, "outlook.last");
      g.outlook.table.forEach((gt: any, i: number) => {
        close(o.table[i].ndvi, gt.ndvi, `outlook.${i}.ndvi`);
        close(o.table[i].lo, gt.lo, `outlook.${i}.lo`);
        expect(iso(o.table[i].day)).toBe(gt.date);
      });
      const slope = dist.srtm?.slope_pct ?? null;
      for (const rot of K.rotations) {
        const sch = scheduleRotation(rot.crops, K);
        for (const tex of ["sandy", "loam"]) {
          for (const burn of [true, false]) {
            const p = soilHealthProfile(rot.crops, sch.bareDays, tex, burn, slope, K);
            const gs = g.soilHealth[`${rot.id}|${tex}|${burn ? 1 : 0}`];
            expect([p.pest, p.erosion, p.forage, p.nFixing, p.deep, p.cover, p.families], `${rot.id}|${tex}|${burn}`)
              .toEqual([gs.pest, gs.erosion, gs.forage, gs.n_fixing, gs.deep, gs.cover, gs.families]);
          }
        }
      }
    });
  }
});

/** Port of pipeline/src/climate_analysis.py — climatology, trends, stress matrix, rainfall cross-check. */
import type { Constants, Fact } from "./types";
import type { Daily, MonthRow } from "./weather";
import { corr, mean, polyfit1, quantile, std, sum } from "./util";

export const recentYears = (years: number[], n: number) => [...years].sort((a, b) => a - b).slice(-n);

export interface ClimMonth {
  month: number;
  tmean: number;
  tmax: number;
  tmin: number;
  rain: number;
  rainP10: number;
  rainP90: number;
  et0: number;
  soilRoot: number;
  soilTop: number;
  rh: number;
  hotDays: number;
  heavyRainDays: number;
  waterBalance: number;
}

export function climatology(monthly: MonthRow[], years: number[]): ClimMonth[] {
  const ys = new Set(years);
  const out: ClimMonth[] = [];
  for (let m = 1; m <= 12; m++) {
    const rows = monthly.filter((r) => r.month === m && ys.has(r.year));
    if (!rows.length) continue;
    const col = (f: (r: MonthRow) => number) => rows.map(f);
    const rain = mean(col((r) => r.rain));
    const et0 = mean(col((r) => r.et0));
    out.push({
      month: m, tmean: mean(col((r) => r.tmean)), tmax: mean(col((r) => r.tmax)), tmin: mean(col((r) => r.tmin)),
      rain, rainP10: quantile(col((r) => r.rain), 0.1), rainP90: quantile(col((r) => r.rain), 0.9), et0,
      soilRoot: mean(col((r) => r.soilRoot)), soilTop: mean(col((r) => r.soilTop)), rh: mean(col((r) => r.rh)),
      hotDays: mean(col((r) => r.hotDays)), heavyRainDays: mean(col((r) => r.heavyRainDays)), waterBalance: rain - et0,
    });
  }
  return out;
}

export interface AnnualRow {
  year: number;
  tmean: number;
  tmaxMean: number;
  rain: number;
  et0: number;
  hotDays: number;
  heavyRainDays: number;
  wheatHeatDays: number;
  monsoonRain: number;
}

export function annualSummary(d: Daily, years: number[]): AnnualRow[] {
  const ys = new Set(years);
  const idx = new Map<number, number[]>();
  for (let k = 0; k < d.n; k++) {
    if (!ys.has(d.year[k])) continue;
    const a = idx.get(d.year[k]);
    if (a) a.push(k);
    else idx.set(d.year[k], [k]);
  }
  return [...idx.entries()].sort((a, b) => a[0] - b[0]).map(([year, ks]) => {
    const pick = (c: keyof Daily["col"], f: (k: number) => boolean = () => true) => ks.filter(f).map((k) => d.col[c][k]);
    const marapr = (k: number) => d.month[k] === 3 || d.month[k] === 4;
    const monsoon = (k: number) => d.month[k] >= 7 && d.month[k] <= 9;
    return {
      year, tmean: mean(pick("T2M")), tmaxMean: mean(pick("T2M_MAX")), rain: sum(pick("PRECTOTCORR")), et0: sum(pick("ET0")),
      hotDays: ks.reduce((a, k) => a + d.hot[k], 0), heavyRainDays: ks.reduce((a, k) => a + d.heavy[k], 0),
      wheatHeatDays: pick("T2M_MAX", marapr).filter((v) => v >= 32).length,
      monsoonRain: sum(pick("PRECTOTCORR", monsoon)),
    };
  });
}

export function linearTrend(x: number[], y: number[]): [number, number] {
  const ok = y.map((v) => !Number.isNaN(v));
  const xs = x.filter((_, i) => ok[i]);
  const yv = y.filter((_, i) => ok[i]);
  if (xs.length < 5) return [NaN, NaN];
  const [slope, intercept] = polyfit1(xs, yv);
  const my = mean(yv);
  let ssRes = 0;
  let ssTot = 0;
  xs.forEach((xx, i) => {
    ssRes += (yv[i] - (slope * xx + intercept)) ** 2;
    ssTot += (yv[i] - my) ** 2;
  });
  return [slope * 10, ssTot ? 1 - ssRes / ssTot : NaN];
}

export interface Trend {
  perDecade: number;
  r2: number;
  earlyMean: number;
  lateMean: number;
  earlyYears: string;
  lateYears: string;
}

export const TREND_COLS = ["tmean", "tmaxMean", "rain", "hotDays", "wheatHeatDays", "monsoonRain"] as const;

export function trends(annual: AnnualRow[]): Record<(typeof TREND_COLS)[number], Trend> {
  const res = {} as Record<(typeof TREND_COLS)[number], Trend>;
  const half = Math.floor(annual.length / 2);
  for (const c of TREND_COLS) {
    const y = annual.map((r) => r[c]);
    const [s, r2] = linearTrend(annual.map((r) => r.year), y);
    res[c] = {
      perDecade: s, r2, earlyMean: mean(y.slice(0, half)), lateMean: mean(y.slice(half)),
      earlyYears: `${annual[0].year}–${annual[half - 1].year}`, lateYears: `${annual[half].year}–${annual[annual.length - 1].year}`,
    };
  }
  return res;
}

/** 0 = low, 1 = moderate, 2 = high, -1 = no data */
export function level(value: number | null, moderate: number, high: number, reverse = false): number {
  if (value === null || Number.isNaN(value)) return -1;
  if (reverse) return value <= high ? 2 : value <= moderate ? 1 : 0;
  return value >= high ? 2 : value >= moderate ? 1 : 0;
}

export const STRESS_INDICATORS = ["heat", "deficit", "drysoil", "heavyrain", "cold", "lowveg"] as const;
export type StressIndicator = (typeof STRESS_INDICATORS)[number];

export interface StressCell {
  level: number;
  value: Record<string, number>;
}

export function stressMatrix(clim: ClimMonth[], ndviMonthly: Map<number, number> | null, C: Constants) {
  const soil = clim.map((r) => r.soilRoot);
  const lo = quantile(soil, 0.33);
  const hi = quantile(soil, 0.66);
  return clim.map((r) => {
    const cells: Partial<Record<StressIndicator, StressCell>> = {
      heat: { level: level(r.tmax, 35, 39), value: { tmax: r.tmax, hotDays: r.hotDays, threshold: C.HOT_DAY_C } },
      deficit: { level: level(-r.waterBalance, 60, 120), value: { rain: r.rain, et0: r.et0 } },
      drysoil: { level: r.soilRoot >= hi ? 0 : r.soilRoot >= lo ? 1 : 2, value: { soilRoot: r.soilRoot } },
      heavyrain: { level: level(r.heavyRainDays, 0.3, 0.8), value: { days: r.heavyRainDays, mm: C.HEAVY_RAIN_MM } },
      cold: { level: level(-r.tmin, -6, -3), value: { tmin: r.tmin } },
    };
    const nv = ndviMonthly?.get(r.month);
    if (nv !== undefined && !Number.isNaN(nv)) cells.lowveg = { level: level(nv, 0.4, 0.3, true), value: { ndvi: nv } };
    return { month: r.month, cells };
  });
}

export function headlineInsights(clim: ClimMonth[], annual: AnnualRow[], tr: ReturnType<typeof trends>, C: Constants): Fact[] {
  const hottest = clim.reduce((a, b) => (b.tmax > a.tmax ? b : a));
  const wettest = clim.reduce((a, b) => (b.rain > a.rain ? b : a));
  const deficit = clim.filter((r) => r.waterBalance < -60).map((r) => r.month);
  const out: Fact[] = [
    { k: "ins_hottest", month: hottest.month, tmax: hottest.tmax, hotDays: hottest.hotDays, threshold: C.HOT_DAY_C },
    { k: "ins_wettest", month: wettest.month, rain: wettest.rain, annual: mean(annual.map((r) => r.rain)) },
  ];
  if (deficit.length) out.push({ k: "ins_deficit", months: deficit });
  const t = tr.tmaxMean;
  if (t && !Number.isNaN(t.perDecade)) {
    out.push({ k: "ins_tmax_trend", diff: Math.abs(t.lateMean - t.earlyMean), warmer: t.perDecade > 0, perDecade: t.perDecade, early: t.earlyYears, late: t.lateYears });
  }
  const w = tr.wheatHeatDays;
  if (w && !Number.isNaN(w.earlyMean)) {
    out.push({ k: "ins_wheat_heat", early: w.earlyMean, late: w.lateMean, earlyYears: w.earlyYears, lateYears: w.lateYears });
  }
  return out;
}

export interface ImergMonth {
  year: number;
  month: number;
  mm: number;
}

export interface CrossCheck {
  powerMm: number;
  imergMm: number;
  biasPct: number;
  rMonthly: number;
  nMonths: number;
  years: string;
  wettestMonth: number;
  agrees: boolean;
  clim: { month: number; power: number; imerg: number }[];
  monthly: { year: number; month: number; power: number; imerg: number }[];
}

export function rainCrosscheck(monthly: MonthRow[], imerg: ImergMonth[] | null, years: number[], C: Constants): CrossCheck | null {
  if (!imerg || !imerg.length) return null;
  const ys = new Set(years);
  const im = new Map(imerg.filter((r) => !Number.isNaN(r.mm)).map((r) => [`${r.year}-${r.month}`, r.mm]));
  const j = monthly
    .filter((r) => ys.has(r.year) && !Number.isNaN(r.rain))
    .filter((r) => im.has(`${r.year}-${r.month}`))
    .map((r) => ({ year: r.year, month: r.month, power: r.rain, imerg: im.get(`${r.year}-${r.month}`)! }));
  if (j.length < 24) return null;
  const byYear = new Map<number, typeof j>();
  for (const r of j) byYear.set(r.year, [...(byYear.get(r.year) ?? []), r]);
  const full = [...byYear.entries()].filter(([, rs]) => rs.length === 12);
  const clim = Array.from({ length: 12 }, (_, i) => {
    const rs = j.filter((r) => r.month === i + 1);
    return { month: i + 1, power: mean(rs.map((r) => r.power)), imerg: mean(rs.map((r) => r.imerg)) };
  });
  const powerMm = full.length ? mean(full.map(([, rs]) => sum(rs.map((r) => r.power)))) : sum(clim.map((c) => c.power));
  const imergMm = full.length ? mean(full.map(([, rs]) => sum(rs.map((r) => r.imerg)))) : sum(clim.map((c) => c.imerg));
  const biasPct = imergMm > 0 ? (100 * (powerMm - imergMm)) / imergMm : NaN;
  const p = j.map((r) => r.power);
  const q = j.map((r) => r.imerg);
  const rMonthly = std(p) && std(q) ? corr(p, q) : NaN;
  let wettest = 1;
  clim.forEach((c) => {
    if (!Number.isNaN(c.imerg) && c.imerg > clim[wettest - 1].imerg) wettest = c.month;
  });
  const yrs = j.map((r) => r.year);
  return {
    powerMm, imergMm, biasPct, rMonthly, nMonths: j.length, years: `${Math.min(...yrs)}–${Math.max(...yrs)}`,
    wettestMonth: wettest, agrees: !Number.isNaN(biasPct) && Math.abs(biasPct) <= C.RAIN_BIAS_WARN_PCT, clim, monthly: j,
  };
}

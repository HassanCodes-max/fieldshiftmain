/** Port of pipeline/src/preprocessing.py: clean NASA POWER, FAO-56 ET0, monthly aggregation. */
import type { Constants } from "./types";
import { count, max, mean, parseISO, sum, ymd } from "./util";

export const POWER_COLS = [
  "T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "RH2M", "GWETTOP", "GWETROOT", "ALLSKY_SFC_SW_DWN", "WS2M",
] as const;
export type PowerCol = (typeof POWER_COLS)[number];

export interface RawPower {
  dates: string[];
  [col: string]: (number | null)[] | string[];
}

/** Columnar daily table (one row per calendar day, gaps kept as NaN). */
export interface Daily {
  n: number;
  day: Int32Array;
  year: Int16Array;
  month: Int8Array;
  doy: Int16Array;
  col: Record<PowerCol | "ET0" | "RA", Float64Array>;
  wasMissing: Uint8Array;
  hot: Uint8Array;
  heavy: Uint8Array;
}

/** FAO-56 eq. 21-25, MJ m-2 day-1 */
export function extraterrestrialRadiation(latDeg: number, doy: number): number {
  const phi = (latDeg * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos(((2 * Math.PI) / 365) * doy);
  const delta = 0.409 * Math.sin(((2 * Math.PI) / 365) * doy - 1.39);
  const ws = Math.acos(Math.min(1, Math.max(-1, -Math.tan(phi) * Math.tan(delta))));
  const gsc = 0.082;
  return ((24 * 60) / Math.PI) * gsc * dr * (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws));
}

/** FAO-56 eq. 52 (Hargreaves), mm/day */
export function hargreavesEt0(tmean: number, tmax: number, tmin: number, ra: number): number {
  const td = Math.max(0, tmax - tmin); // NaN propagates like numpy.clip
  return 0.0023 * (tmean + 17.8) * Math.sqrt(Number.isNaN(tmax - tmin) ? NaN : td) * ra * 0.408;
}

/** pandas interpolate(limit=3, limit_area="inside"): linear fill of the first `limit` NaNs of each inner gap. */
function interpolateInside(a: Float64Array, limit = 3): void {
  const n = a.length;
  let i = 0;
  while (i < n) {
    if (!Number.isNaN(a[i])) {
      i++;
      continue;
    }
    const start = i;
    while (i < n && Number.isNaN(a[i])) i++;
    const end = i; // first valid index after the gap (or n)
    if (start === 0 || end === n) continue; // not "inside"
    const x0 = start - 1;
    const y0 = a[x0];
    const y1 = a[end];
    for (let k = start; k < Math.min(end, start + limit); k++) {
      a[k] = y0 + ((y1 - y0) * (k - x0)) / (end - x0);
    }
  }
}

export interface Scenario {
  temp: number;
  rainPct: number;
}

export function cleanPower(raw: RawPower, lat: number, C: Constants, scenario: Scenario = { temp: 0, rainPct: 0 }): Daily {
  // sort + de-duplicate + reindex to a full daily range
  const rows = raw.dates.map((d, i) => ({ day: parseISO(d), i }));
  rows.sort((a, b) => a.day - b.day);
  const seen = new Map<number, number>();
  for (const r of rows) if (!seen.has(r.day)) seen.set(r.day, r.i);
  const first = rows[0].day;
  const last = rows[rows.length - 1].day;
  const n = last - first + 1;
  const day = new Int32Array(n);
  const col = {} as Daily["col"];
  for (const c of POWER_COLS) col[c] = new Float64Array(n).fill(NaN);
  for (let k = 0; k < n; k++) {
    day[k] = first + k;
    const src = seen.get(first + k);
    if (src === undefined) continue;
    for (const c of POWER_COLS) {
      const v = (raw[c] as (number | null)[] | undefined)?.[src];
      col[c][k] = v === null || v === undefined ? NaN : v;
    }
  }
  const wasMissing = new Uint8Array(n);
  for (let k = 0; k < n; k++) wasMissing[k] = Number.isNaN(col.T2M[k]) ? 1 : 0;
  for (const c of POWER_COLS) interpolateInside(col[c]);

  const factor = 1 + scenario.rainPct / 100;
  for (let k = 0; k < n; k++) {
    if (scenario.temp) {
      col.T2M[k] += scenario.temp;
      col.T2M_MAX[k] += scenario.temp;
      col.T2M_MIN[k] += scenario.temp;
    }
    const p = col.PRECTOTCORR[k];
    col.PRECTOTCORR[k] = Number.isNaN(p) ? NaN : Math.max(0, p) * factor;
  }

  const year = new Int16Array(n);
  const month = new Int8Array(n);
  const doy = new Int16Array(n);
  const RA = new Float64Array(n);
  const ET0 = new Float64Array(n);
  const hot = new Uint8Array(n);
  const heavy = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const t = ymd(day[k]);
    year[k] = t.y;
    month[k] = t.m;
    doy[k] = day[k] - Math.round(Date.UTC(t.y, 0, 1) / 86_400_000) + 1;
    RA[k] = extraterrestrialRadiation(lat, doy[k]);
    ET0[k] = hargreavesEt0(col.T2M[k], col.T2M_MAX[k], col.T2M_MIN[k], RA[k]);
    hot[k] = col.T2M_MAX[k] >= C.HOT_DAY_C ? 1 : 0;
    heavy[k] = col.PRECTOTCORR[k] >= C.HEAVY_RAIN_MM ? 1 : 0;
  }
  col.RA = RA;
  col.ET0 = ET0;
  return { n, day, year, month, doy, col, wasMissing, hot, heavy };
}

export function completeYears(d: Daily, minDays = 360): number[] {
  const counts = new Map<number, number>();
  for (let k = 0; k < d.n; k++) if (!Number.isNaN(d.col.T2M[k])) counts.set(d.year[k], (counts.get(d.year[k]) ?? 0) + 1);
  return [...counts.entries()].filter(([, c]) => c >= minDays).map(([y]) => y).sort((a, b) => a - b);
}

export interface MonthRow {
  year: number;
  month: number;
  tmean: number;
  tmax: number;
  tmin: number;
  tmaxAbs: number;
  rain: number;
  et0: number;
  rh: number;
  soilTop: number;
  soilRoot: number;
  solar: number;
  hotDays: number;
  heavyRainDays: number;
  nDays: number;
  waterBalance: number;
}

/** Contiguous index ranges [start, end) per (year, month). */
function monthRanges(d: Daily): { year: number; month: number; a: number; b: number }[] {
  const out: { year: number; month: number; a: number; b: number }[] = [];
  let a = 0;
  for (let k = 1; k <= d.n; k++) {
    if (k === d.n || d.month[k] !== d.month[a]) {
      out.push({ year: d.year[a], month: d.month[a], a, b: k });
      a = k;
    }
  }
  return out;
}

export function toMonthly(d: Daily): MonthRow[] {
  return monthRanges(d).map(({ year, month, a, b }) => {
    const s = (c: keyof Daily["col"]) => d.col[c].subarray(a, b);
    let hotDays = 0;
    let heavyDays = 0;
    for (let k = a; k < b; k++) {
      hotDays += d.hot[k];
      heavyDays += d.heavy[k];
    }
    const rain = sum(s("PRECTOTCORR"), 20);
    const et0 = sum(s("ET0"), 20);
    return {
      year, month,
      tmean: mean(s("T2M")), tmax: mean(s("T2M_MAX")), tmin: mean(s("T2M_MIN")), tmaxAbs: max(s("T2M_MAX")),
      rain, et0, rh: mean(s("RH2M")), soilTop: mean(s("GWETTOP")), soilRoot: mean(s("GWETROOT")),
      solar: mean(s("ALLSKY_SFC_SW_DWN")), hotDays, heavyRainDays: heavyDays, nDays: count(s("T2M")),
      waterBalance: rain - et0,
    };
  });
}

export function dataQuality(d: Daily) {
  let missing = 0;
  let still = 0;
  for (let k = 0; k < d.n; k++) {
    missing += d.wasMissing[k];
    if (Number.isNaN(d.col.T2M[k])) still++;
  }
  return {
    firstDay: d.day[0],
    lastDay: d.day[d.n - 1],
    nDays: d.n,
    missingDaysRaw: missing,
    stillMissingAfterFill: still,
    completeYears: completeYears(d),
  };
}

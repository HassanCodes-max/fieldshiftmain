/** Port of pipeline/src/vegetation_analysis.py and the inference half of ndvi_forecast.py. */
import { dayOf, doyOf, iso, median, parseISO, quantile, ymd } from "./util";

export interface NdviPoint {
  day: number;
  ndvi: number;
  year: number;
  month: number;
  doy: number;
  slot: number;
}

export function cleanNdvi(raw: { dates: string[]; ndvi: (number | null)[] }): NdviPoint[] {
  const out: NdviPoint[] = [];
  raw.dates.forEach((d, i) => {
    const v = raw.ndvi[i];
    if (v === null || Number.isNaN(v) || !(v > -0.2 && v <= 1)) return;
    const day = parseISO(d);
    const t = ymd(day);
    const doy = doyOf(day);
    out.push({ day, ndvi: v, year: t.y, month: t.m, doy, slot: Math.floor((doy - 1) / 16) + 1 });
  });
  return out.sort((a, b) => a.day - b.day);
}

export interface NdviClimRow {
  slot: number;
  ndvi: number;
  p25: number;
  p75: number;
  nYears: number;
  doy: number;
  dateRef: number;
  month: number;
}

export function ndviClimatology(d: NdviPoint[]): NdviClimRow[] {
  const slots = [...new Set(d.map((p) => p.slot))].sort((a, b) => a - b);
  return slots.map((slot) => {
    const g = d.filter((p) => p.slot === slot);
    const v = g.map((p) => p.ndvi);
    const doy = (slot - 1) * 16 + 8;
    const dateRef = dayOf(2021, 1, 1) + doy - 1;
    return {
      slot, ndvi: median(v), p25: quantile(v, 0.25), p75: quantile(v, 0.75),
      nYears: new Set(g.map((p) => p.year)).size, doy, dateRef, month: ymd(dateRef).m,
    };
  });
}

export interface LowWindow {
  start: number;
  end: number;
  minNdvi: number;
  slots: number[];
}

export function lowVegetationWindows(clim: NdviClimRow[], threshold?: number): { windows: LowWindow[]; threshold: number } {
  const thr = threshold ?? Math.min(0.4, quantile(clim.map((c) => c.ndvi), 0.3));
  const below = clim.map((c) => c.ndvi < thr);
  const windows: LowWindow[] = [];
  let start: number | null = null;
  below.forEach((b, i) => {
    if (b && start === null) start = i;
    if ((!b || i === below.length - 1) && start !== null) {
      const end = b ? i : i - 1;
      const part = clim.slice(start, end + 1);
      windows.push({
        start: clim[start].dateRef, end: clim[end].dateRef + 15,
        minNdvi: Math.min(...part.map((c) => c.ndvi)), slots: part.map((c) => c.slot),
      });
      start = null;
    }
  });
  return { windows, threshold: thr };
}

export function windowDoys(windows: LowWindow[]): Set<number> {
  const days = new Set<number>();
  for (const w of windows) for (let t = w.start; t <= w.end; t++) if (ymd(t).y === 2021) days.add(doyOf(t));
  return days;
}

export function seasonalPeaks(d: NdviPoint[]) {
  const years = [...new Set(d.map((p) => p.year))].sort((a, b) => a - b);
  const peak = (g: NdviPoint[]) => {
    if (!g.length) return { v: NaN, day: null as number | null };
    let best = g[0];
    for (const p of g) if (p.ndvi > best.ndvi) best = p;
    return { v: best.ndvi, day: best.day };
  };
  return years.map((year) => {
    const g = d.filter((p) => p.year === year);
    const r = peak(g.filter((p) => p.month >= 1 && p.month <= 4));
    const k = peak(g.filter((p) => p.month >= 7 && p.month <= 10));
    return { year, rabiPeak: r.v, rabiPeakDay: r.day, kharifPeak: k.v, kharifPeakDay: k.day };
  });
}

/** Monthly mean of the slot climatology (used by the stress matrix). */
export function ndviByMonth(clim: NdviClimRow[]): Map<number, number> {
  const m = new Map<number, number[]>();
  for (const c of clim) m.set(c.month, [...(m.get(c.month) ?? []), c.ndvi]);
  return new Map([...m.entries()].map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]));
}

// --------------------------------------------------------------------------- ML outlook (ridge regression)
export interface NdviModel {
  leads: number[];
  lags: number;
  ridge: number;
  coefs: Record<string, number[]>;
  residQ: Record<string, [number, number]>;
  skill: { lead: number; days: number; mae_model: number; mae_normal: number; mae_persist: number; skill_vs_normal: number; skill_vs_persist: number; n: number }[];
  clims: Record<string, Record<string, number>>;
  trainedOn: number[];
}

export interface Outlook {
  lastDay: number;
  lastNdvi: number;
  lastClim: number;
  table: { lead: number; day: number; ndvi: number; lo: number; hi: number; clim: number; anomaly: number }[];
  meanAnomaly: number;
  word: "above" | "below" | "near";
}

export function outlook(model: NdviModel, region: string | null, d: NdviPoint[]): Outlook | null {
  if (d.length < 3) return null;
  let clim: Map<number, number>;
  const stored = region ? model.clims[region] : undefined;
  if (stored) clim = new Map(Object.entries(stored).map(([k, v]) => [Number(k), v]));
  else clim = new Map(ndviClimatology(d).map((c) => [c.slot, c.ndvi]));
  const a = d.map((p) => p.ndvi - (clim.get(p.slot) ?? NaN));
  const t = d.length - 1;
  const last = d[t];
  const table = model.leads.map((h) => {
    const day = last.day + 16 * h;
    const slot = Math.floor((doyOf(day) - 1) / 16) + 1;
    const cT = clim.get(last.slot) ?? NaN;
    const cH = clim.get(slot) ?? NaN;
    const x = [a[t], a[t - 1], a[t - 2], cH - cT, 1];
    const b = model.coefs[String(h)];
    const an = x.reduce((s, xi, i) => s + xi * b[i], 0);
    const [lo, hi] = model.residQ[String(h)];
    return { lead: h, day, ndvi: cH + an, lo: cH + an + lo, hi: cH + an + hi, clim: cH, anomaly: an };
  });
  const meanAnomaly = table.reduce((s, r) => s + r.anomaly, 0) / table.length;
  return {
    lastDay: last.day, lastNdvi: last.ndvi, lastClim: clim.get(last.slot) ?? NaN, table, meanAnomaly,
    word: meanAnomaly > 0.03 ? "above" : meanAnomaly < -0.03 ? "below" : "near",
  };
}

export { iso };

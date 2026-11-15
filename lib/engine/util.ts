/**
 * Numeric and calendar helpers that reproduce the behaviour of the Python engine
 * (numpy / pandas semantics) so the TypeScript port gives the same numbers.
 * Dates are whole days since 1970-01-01 (UTC) to avoid time-zone drift.
 */

export const MS_DAY = 86_400_000;

export function dayOf(y: number, m: number, d: number): number {
  return Math.round(Date.UTC(y, m - 1, d) / MS_DAY);
}

export function parseISO(s: string): number {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return dayOf(y, m, d);
}

export function ymd(day: number): { y: number; m: number; d: number } {
  const t = new Date(day * MS_DAY);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

export function iso(day: number): string {
  return new Date(day * MS_DAY).toISOString().slice(0, 10);
}

export function doyOf(day: number): number {
  const { y } = ymd(day);
  return day - dayOf(y, 1, 1) + 1;
}

/** "MM-DD" in a given year. */
export function mmdd(s: string, year: number): number {
  const [m, d] = s.split("-").map(Number);
  return dayOf(year, m, d);
}

/** Python's round(): half to even (also numpy.round). */
export function roundHalfEven(x: number): number {
  const r = Math.round(x);
  const diff = Math.abs(x % 1);
  if (Math.abs(diff - 0.5) < 1e-9) return r % 2 === 0 ? r : r - 1;
  return r;
}

export const isNum = (x: number | null | undefined): x is number =>
  x !== null && x !== undefined && !Number.isNaN(x);

export function clip(x: number, lo = 0, hi = 100): number {
  if (Number.isNaN(x)) return x;
  return Math.min(hi, Math.max(lo, x));
}

/** pandas mean (skips NaN; NaN if nothing left). */
export function mean(a: ArrayLike<number>): number {
  let s = 0;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (!Number.isNaN(v)) {
      s += v;
      n++;
    }
  }
  return n ? s / n : NaN;
}

/** pandas sum with min_count (default 0 -> 0 for an all-NaN group). */
export function sum(a: ArrayLike<number>, minCount = 0): number {
  let s = 0;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (!Number.isNaN(v)) {
      s += v;
      n++;
    }
  }
  return n >= minCount ? s : NaN;
}

export function count(a: ArrayLike<number>): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (!Number.isNaN(a[i])) n++;
  return n;
}

export function max(a: ArrayLike<number>): number {
  let m = -Infinity;
  let any = false;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (!Number.isNaN(v)) {
      any = true;
      if (v > m) m = v;
    }
  }
  return any ? m : NaN;
}

export function min(a: ArrayLike<number>): number {
  let m = Infinity;
  let any = false;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (!Number.isNaN(v)) {
      any = true;
      if (v < m) m = v;
    }
  }
  return any ? m : NaN;
}

/** pandas Series.quantile (linear interpolation, NaN skipped). */
export function quantile(a: ArrayLike<number>, q: number): number {
  const v: number[] = [];
  for (let i = 0; i < a.length; i++) if (!Number.isNaN(a[i])) v.push(a[i]);
  if (!v.length) return NaN;
  v.sort((x, y) => x - y);
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

export const median = (a: ArrayLike<number>) => quantile(a, 0.5);

/** Sample standard deviation (ddof = 1), as pandas. */
export function std(a: ArrayLike<number>): number {
  const m = mean(a);
  let s = 0;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    if (!Number.isNaN(a[i])) {
      s += (a[i] - m) ** 2;
      n++;
    }
  }
  return n > 1 ? Math.sqrt(s / (n - 1)) : NaN;
}

/** Least-squares line (numpy.polyfit deg 1). Returns [slope, intercept]. */
export function polyfit1(x: ArrayLike<number>, y: ArrayLike<number>): [number, number] {
  const n = x.length;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += x[i];
    my += y[i];
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
  }
  const slope = sxx ? sxy / sxx : NaN;
  return [slope, my - slope * mx];
}

/** Pearson correlation (numpy.corrcoef). */
export function corr(x: ArrayLike<number>, y: ArrayLike<number>): number {
  const n = x.length;
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

/** numpy.linspace */
export function linspace(a: number, b: number, num: number, endpoint = true): number[] {
  if (num <= 0) return [];
  if (num === 1) return [a];
  const div = endpoint ? num - 1 : num;
  const step = (b - a) / div;
  const out = new Array<number>(num);
  for (let i = 0; i < num; i++) out[i] = i * step + a;
  if (endpoint) out[num - 1] = b;
  return out;
}

export function groupBy<T, K extends string | number>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const g = m.get(k);
    if (g) g.push(it);
    else m.set(k, [it]);
  }
  return m;
}

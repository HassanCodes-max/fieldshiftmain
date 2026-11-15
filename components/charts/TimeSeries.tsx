import { fmtInt, fmtNum, type Lang } from "@/lib/i18n";

/** Dated line chart (e.g. every MODIS NDVI composite since 2015). */
export function TimeSeries({ lang, dates, values, color, label, digits = 2, height = 200, threshold }: {
  lang: Lang; dates: string[]; values: (number | null)[]; color: string; label: string; digits?: number; height?: number; threshold?: number | null;
}) {
  const W = 640;
  const H = height;
  const P = { l: 40, r: 10, t: 10, b: 26 };
  const t = dates.map((d) => Date.parse(`${d}T00:00:00Z`));
  const t0 = t[0];
  const t1 = t.at(-1)!;
  const v = values.filter((x): x is number => x !== null);
  const lo = Math.min(...v, threshold ?? Infinity);
  const hi = Math.max(...v);
  const X = (ti: number) => P.l + ((ti - t0) / (t1 - t0 || 1)) * (W - P.l - P.r);
  const Y = (x: number) => H - P.b - ((x - lo) / (hi - lo || 1)) * (H - P.t - P.b);
  let d = "";
  values.forEach((x, i) => {
    if (x === null) return;
    d += `${d ? "L" : "M"}${X(t[i]).toFixed(1)},${Y(x).toFixed(1)}`;
  });
  const y0 = new Date(t0).getUTCFullYear();
  const y1 = new Date(t1).getUTCFullYear();
  const years = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full" style={{ direction: "ltr" }}>
      {years.map((y) => {
        const xx = X(Date.UTC(y, 0, 1));
        if (xx < P.l) return null;
        return (
          <g key={y}>
            <line x1={xx} x2={xx} y1={P.t} y2={H - P.b} stroke="#e8dec8" />
            <text x={xx + 3} y={H - 8} className="fill-ink-500 text-[10px]">{fmtInt(lang, y)}</text>
          </g>
        );
      })}
      {[lo, (lo + hi) / 2, hi].map((g) => (
        <text key={g} x={P.l - 6} y={Y(g) + 4} textAnchor="end" className="tnum fill-ink-500 text-[10px]">{fmtNum(lang, g, digits)}</text>
      ))}
      {threshold !== undefined && threshold !== null && <line x1={P.l} x2={W - P.r} y1={Y(threshold)} y2={Y(threshold)} stroke="#a24e2d" strokeDasharray="4 4" strokeWidth="1" />}
      <path d={d} pathLength={1} className="chart-line" fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

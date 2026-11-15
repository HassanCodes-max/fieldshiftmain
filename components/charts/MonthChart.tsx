/** Month-of-year chart (Jan–Dec) with bars, lines and an optional band. Pure SVG, rendered on the server. */
import { fmtNum, getDict, type Lang } from "@/lib/i18n";

export type Series =
  | { kind: "bar"; values: (number | null)[]; color: string; label: string }
  | { kind: "line"; values: (number | null)[]; color: string; label: string; dashed?: boolean }
  | { kind: "band"; lower: (number | null)[]; upper: (number | null)[]; color: string; label: string };

function niceTicks(lo: number, hi: number, n = 4): number[] {
  const span = hi - lo || 1;
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) ?? raw;
  const start = Math.floor(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + step * 0.001; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export function MonthChart({ lang, series, unit = "", digits = 0, min, max, highlight, height = 260, label, shade }: {
  lang: Lang; series: Series[]; unit?: string; digits?: number; min?: number; max?: number; highlight?: number; height?: number; label: string;
  shade?: { from: number; to: number; color: string }[];
}) {
  const d = getDict(lang);
  const W = 640;
  const H = height;
  const P = { l: 46, r: 12, t: 14, b: 30 };
  const vals = series.flatMap((s) => (s.kind === "band" ? [...s.lower, ...s.upper] : s.values)).filter((v): v is number => v !== null && Number.isFinite(v));
  const lo = min ?? Math.min(0, ...vals);
  const hiRaw = max ?? Math.max(...vals);
  const ticks = niceTicks(lo, hiRaw);
  const hi = Math.max(hiRaw, ticks.at(-1) ?? hiRaw);
  const bw = (W - P.l - P.r) / 12;
  const x = (i: number) => P.l + (i + 0.5) * bw;
  const y = (v: number) => H - P.b - ((v - lo) / (hi - lo || 1)) * (H - P.t - P.b);
  const bars = series.filter((s) => s.kind === "bar");
  const path = (values: (number | null)[]) => {
    let p = "";
    values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) return;
      p += `${p ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    });
    return p;
  };
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full" style={{ direction: "ltr" }}>
        {shade?.map((s, i) => (
          <rect key={i} x={P.l + (s.from - 1) * bw} y={P.t} width={(s.to - s.from + 1) * bw} height={H - P.t - P.b} fill={s.color} />
        ))}
        {highlight ? <rect x={P.l + (highlight - 1) * bw} y={P.t} width={bw} height={H - P.t - P.b} fill="#c8962e" opacity="0.1" rx="4" /> : null}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="#d9cbae" strokeWidth="1" strokeDasharray={t === 0 ? "" : "2 4"} />
            <text x={P.l - 8} y={y(t) + 4} textAnchor="end" className="tnum fill-ink-500 text-[11px]">{fmtNum(lang, t, digits)}</text>
          </g>
        ))}
        {series.map((s, si) => {
          if (s.kind === "band") {
            const top = s.upper.map((v, i) => (v === null ? null : `${x(i)},${y(v)}`)).filter(Boolean);
            const bot = s.lower.map((v, i) => (v === null ? null : `${x(i)},${y(v)}`)).filter(Boolean).reverse();
            return <polygon key={si} points={[...top, ...bot].join(" ")} fill={s.color} opacity="0.25" />;
          }
          if (s.kind === "bar") {
            const bi = bars.indexOf(s);
            const w = (bw * 0.66) / bars.length;
            return (
              <g key={si}>
                {s.values.map((v, i) => (v === null || !Number.isFinite(v) ? null : (
                  <rect key={i} className="chart-bar" style={{ animationDelay: `${i * 30}ms` }} x={x(i) - bw * 0.33 + bi * w + 1} y={Math.min(y(v), y(Math.max(0, lo)))}
                    width={Math.max(1, w - 2)} height={Math.abs(y(Math.max(0, lo)) - y(v))} rx="2" fill={s.color} />
                )))}
              </g>
            );
          }
          return (
            <g key={si}>
              <path d={path(s.values)} pathLength={1} className="chart-line" fill="none" stroke={s.color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? "0.012 0.01" : undefined} />
              {s.values.map((v, i) => (v === null || !Number.isFinite(v) ? null : <circle key={i} cx={x(i)} cy={y(v)} r="3" fill={s.color} />))}
            </g>
          );
        })}
        {d.monthsShort.map((m, i) => (
          <text key={i} x={x(i)} y={H - 9} textAnchor="middle" className={`fill-ink-500 ${lang === "ur" ? "text-[10px]" : "text-[11px]"}`}>{lang === "ur" ? m.slice(0, 4) : m}</text>
        ))}
        {unit && <text x={6} y={P.t + 2} className="fill-ink-400 text-[10px]">{unit}</text>}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.82rem] text-ink-600">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color, opacity: s.kind === "band" ? 0.4 : 1 }} />
            {s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

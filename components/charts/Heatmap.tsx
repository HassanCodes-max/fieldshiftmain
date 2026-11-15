import { fmtInt, fmtNum, getDict, type Lang } from "@/lib/i18n";

const LEVEL = ["#e9ebd6", "#f1d58f", "#c8714a"];
const LEVEL_TEXT = ["#3d4620", "#6f4f12", "#fff"];

/** Month × indicator risk grid (0 low · 1 moderate · 2 high). */
export function RiskGrid({ lang, rows, now = -1 }: { lang: Lang; rows: { key: string; label: string; levels: (number | null)[]; titles?: string[] }[]; now?: number }) {
  const d = getDict(lang);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-separate border-spacing-1 text-center text-[0.78rem]">
        <thead>
          <tr>
            <th className="w-32" />
            {d.monthsShort.map((m, i) => (
              <th key={m} className={`pb-1 font-medium ${i === now ? "text-harvest-700" : "text-ink-500"}`}>{lang === "ur" ? m.slice(0, 4) : m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="pe-2 text-start text-[0.85rem] font-medium text-ink-700">{r.label}</th>
              {r.levels.map((lv, i) => (
                <td key={i} title={r.titles?.[i]} className="h-8 rounded-md" style={{ background: lv === null || lv < 0 ? "#f2ebdc" : LEVEL[lv], color: lv === null || lv < 0 ? "#857f71" : LEVEL_TEXT[lv] }}>
                  <span className="sr-only">{lv === null || lv < 0 ? "—" : d.land.stressLevels[lv]}</span>
                  <span aria-hidden="true">{lv === 2 ? "●" : lv === 1 ? "◐" : ""}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Year × month anomaly grid with a diverging colour scale. */
export function AnomalyGrid({ lang, rows, scale, unit, hot }: { lang: Lang; rows: { year: number; values: (number | null)[] }[]; scale: number; unit: string; hot: boolean }) {
  const d = getDict(lang);
  const color = (v: number | null) => {
    if (v === null) return "#f2ebdc";
    const k = Math.max(-1, Math.min(1, v / scale));
    const pos = hot ? [162, 78, 45] : [62, 110, 126];
    const neg = hot ? [62, 110, 126] : [140, 100, 24];
    const c = k >= 0 ? pos : neg;
    const a = Math.abs(k);
    const mix = (x: number, y: number) => Math.round(x + (y - x) * a);
    return `rgb(${mix(248, c[0])},${mix(243, c[1])},${mix(232, c[2])})`;
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[360px] border-separate border-spacing-[2px] text-[0.7rem]">
        <thead>
          <tr>
            <th />
            {d.monthsShort.map((m) => (
              <th key={m} className="font-medium text-ink-500">{lang === "ur" ? m.slice(0, 3) : m[0]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.year}>
              <th scope="row" className="pe-1.5 text-end font-medium text-ink-500 tnum">{fmtInt(lang, r.year)}</th>
              {r.values.map((v, i) => (
                <td key={i} className="h-4 rounded-[3px]" style={{ background: color(v) }} title={v === null ? "" : `${d.months[i]} ${fmtInt(lang, r.year)}: ${v > 0 ? "+" : ""}${fmtNum(lang, v, 1)} ${unit}`} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

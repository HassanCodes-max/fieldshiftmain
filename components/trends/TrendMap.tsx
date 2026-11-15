"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { districtName, fmtInt, fmtNum, getDict, type Lang } from "@/lib/i18n";

export interface DistrictYears { id: string; lat: number; lon: number; years: Record<string, Record<string, number | null>> }

const METRICS: { key: string; digits: number; unit: string; hot: boolean }[] = [
  { key: "hotDays", digits: 0, unit: "", hot: true },
  { key: "tmaxMean", digits: 1, unit: "°C", hot: true },
  { key: "rain", digits: 0, unit: "mm", hot: false },
  { key: "ndviPeak", digits: 2, unit: "", hot: false },
  { key: "smap", digits: 2, unit: "m³/m³", hot: false },
];
const IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

function colour(k: number, hot: boolean) {
  const a = hot ? [233, 214, 160] : [214, 226, 201];
  const b = hot ? [162, 78, 45] : [47, 88, 102];
  return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * k)).join(",")})`;
}

export function TrendMap({ lang, data }: { lang: Lang; data: DistrictYears[] }) {
  const d = getDict(lang);
  const [metric, setMetric] = useState("hotDays");
  const m = METRICS.find((x) => x.key === metric)!;
  const allYears = useMemo(() => [...new Set(data.flatMap((x) => Object.keys(x.years).filter((y) => x.years[y][metric] !== null && x.years[y][metric] !== undefined)))].map(Number).sort(), [data, metric]);
  const [chosenYear, setYear] = useState(allYears.at(-1) ?? 2025);
  const year = allYears.includes(chosenYear) ? chosenYear : (allYears.at(-1) ?? chosenYear);
  const [playing, setPlaying] = useState(false);
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<Record<string, L.CircleMarker>>({});

  const range = useMemo(() => {
    const v = data.flatMap((x) => Object.values(x.years).map((r) => r[metric])).filter((x): x is number => typeof x === "number");
    return [Math.min(...v), Math.max(...v)];
  }, [data, metric]);

  useEffect(() => {
    if (!el.current || map.current) return;
    const mp = L.map(el.current, { scrollWheelZoom: false, attributionControl: true }).setView([31.2, 73.0], 7);
    L.tileLayer(IMAGERY, { maxZoom: 12, attribution: "Imagery © Esri, Maxar" }).addTo(mp);
    for (const x of data) {
      layers.current[x.id] = L.circleMarker([x.lat, x.lon], { radius: 10, color: "#fffcf5", weight: 2, fillOpacity: 0.9 })
        .bindTooltip("", { permanent: true, direction: "right", offset: [12, 0], className: "fs-tip" }).addTo(mp);
    }
    map.current = mp;
    return () => {
      mp.remove();
      map.current = null;
      layers.current = {};
    };
  }, [data]);

  useEffect(() => {
    const [lo, hi] = range;
    for (const x of data) {
      const c = layers.current[x.id];
      if (!c) continue;
      const v = x.years[String(year)]?.[metric];
      if (typeof v !== "number") {
        c.setStyle({ fillColor: "#b8987a", fillOpacity: 0.4 }).setRadius(7);
        c.setTooltipContent(`${districtName(lang, x.id)} · ${d.trends.noData}`);
        continue;
      }
      const k = hi > lo ? (v - lo) / (hi - lo) : 0.5;
      c.setStyle({ fillColor: colour(k, m.hot), fillOpacity: 0.92 }).setRadius(9 + 22 * k);
      c.setTooltipContent(`${districtName(lang, x.id)} · ${fmtNum(lang, v, m.digits)} ${m.unit === "mm" ? d.common.mm : m.unit}`);
    }
  }, [year, metric, range, data, lang, d, m]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setYear((y) => {
        const i = allYears.indexOf(y);
        if (i < 0 || i >= allYears.length - 1) {
          setPlaying(false);
          return y;
        }
        return allYears[i + 1];
      });
    }, 900);
    return () => clearInterval(id);
  }, [playing, allYears]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2" role="radiogroup" aria-label="metric">
        {METRICS.map((x) => (
          <button key={x.key} type="button" role="radio" aria-checked={metric === x.key} onClick={() => setMetric(x.key)}
            className={`min-h-10 rounded-full border px-3.5 text-sm ${metric === x.key ? "border-forest-900 bg-forest-900 text-cream" : "border-soil-200 bg-paper text-ink-700 hover:bg-beige-100"}`}>
            {d.trends.metric[x.key]}
          </button>
        ))}
      </div>
      <div ref={el} className="h-[480px] w-full overflow-hidden rounded-2xl border hairline" style={{ direction: "ltr" }} />
      <div className="mt-4 flex items-center gap-4">
        <button type="button" onClick={() => { if (!playing && year === allYears.at(-1)) setYear(allYears[0]); setPlaying((p) => !p); }}
          className="min-h-11 rounded-full bg-forest-900 px-5 font-medium text-cream">{playing ? d.trends.pause : d.trends.play}</button>
        <label className="flex flex-1 items-center gap-3">
          <span className="sr-only">{d.trends.year}</span>
          <input type="range" min={0} max={allYears.length - 1} value={Math.max(0, allYears.indexOf(year))} onChange={(e) => { setPlaying(false); setYear(allYears[Number(e.target.value)]); }} className="w-full accent-harvest-600" />
        </label>
        <span className="tnum min-w-16 font-display text-3xl text-forest-900">{fmtInt(lang, year)}</span>
      </div>
      <p className="mt-2 text-[0.85rem] text-ink-500">{d.trends.legend}</p>
    </div>
  );
}

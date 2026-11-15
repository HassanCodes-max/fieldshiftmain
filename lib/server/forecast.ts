import "server-only";
import { cacheLife } from "next/cache";

export interface ForecastDay { date: string; tmax: number; tmin: number; rain: number; rainProb: number | null }
export interface Forecast { days: ForecastDay[]; tips: { k: string; mm?: number; t?: number; day?: string }[]; fetched: string }

/** 7-day forecast from Open-Meteo (free, no key). Cached on the server for an hour, shared by all visitors. */
export async function getForecast(lat: number, lon: number): Promise<Forecast | null> {
  "use cache";
  cacheLife("hours");
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({
      latitude: lat.toFixed(2), longitude: lon.toFixed(2), forecast_days: "7", timezone: "Asia/Karachi",
      daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max",
    }).toString();
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const d = (await r.json()).daily as Record<string, (number | null)[]> & { time: string[] };
    const days: ForecastDay[] = d.time.map((t, i) => ({
      date: t, tmax: d.temperature_2m_max[i] ?? NaN, tmin: d.temperature_2m_min[i] ?? NaN,
      rain: d.precipitation_sum[i] ?? 0, rainProb: d.precipitation_probability_max?.[i] ?? null,
    }));
    return { days, tips: tips(days), fetched: new Date().toISOString() };
  } catch {
    return null;
  }
}

/** Same rules as the earlier website: skip-irrigation rain, heavy rain, heat, frost, dry week. */
export function tips(days: ForecastDay[]): Forecast["tips"] {
  const out: Forecast["tips"] = [];
  const heavy = days.find((d) => d.rain >= 30);
  if (heavy) out.push({ k: "wx_heavy", mm: heavy.rain, day: heavy.date });
  let cum = 0;
  let hit: ForecastDay | null = null;
  let hitMm = 0;
  for (const d of days) {
    cum += d.rain;
    if (cum >= 10 && !hit) {
      hit = d;
      hitMm = cum;
    }
  }
  if (hit) out.push({ k: "wx_rain", mm: hitMm, day: hit.date });
  const hot = days.filter((d) => d.tmax >= 40);
  if (hot.length) out.push({ k: "wx_heat", t: Math.max(...hot.map((d) => d.tmax)), day: hot[0].date });
  const cold = days.filter((d) => d.tmin <= 2);
  if (cold.length) out.push({ k: "wx_cold", t: Math.min(...cold.map((d) => d.tmin)), day: cold[0].date });
  if (cum < 2) out.push({ k: "wx_dry" });
  return out;
}

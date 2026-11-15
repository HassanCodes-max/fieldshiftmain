import "server-only";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  cleanNdvi, cleanPower, ndviClimatology, lowVegetationWindows, windowDoys, POWER_COLS,
  type Daily, type NdviPoint, type RawPower, type Scenario,
} from "@/lib/engine";
import { getDistrict, getKnowledge, type DistrictFile } from "./data";
import { getDb } from "./db";

export const BOUNDS = { latMin: 23.5, latMax: 37.2, lonMin: 60.8, lonMax: 77.9 }; // Pakistan

export type LocationRef = { region: string } | { lat: number; lon: number };

export interface LocationData {
  key: string;
  kind: "district" | "custom";
  region: string | null;
  name: string;
  lat: number;
  lon: number;
  zone: string | null;
  power: RawPower;
  powerSource: string;
  ndvi: NdviPoint[] | null;
  smap: DistrictFile["smap"] | null;
  imerg: { year: number; month: number; mm: number }[] | null;
  srtm: { elevation_m: number; relief_m: number; slope_pct: number } | null;
  landcover: DistrictFile["landcover"];
}

export class LocationError extends Error {
  constructor(public code: "out_of_bounds" | "nasa_unavailable" | "unknown_region") {
    super(code);
  }
}

const keyOf = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`;
const memo = new Map<string, Promise<LocationData>>();

export async function resolveLocation(ref: LocationRef): Promise<LocationData> {
  const K = await getKnowledge();
  if ("region" in ref) {
    const r = K.regions.find((x) => x.id === ref.region);
    if (!r) throw new LocationError("unknown_region");
    const key = `region:${r.id}`;
    let p = memo.get(key);
    if (!p) {
      p = getDistrict(r.id).then((d) => ({
        key, kind: "district" as const, region: r.id, name: r.district, lat: r.lat, lon: r.lon, zone: r.zone,
        power: d.power, powerSource: "NASA POWER (cached archive)", ndvi: cleanNdvi(d.ndvi), smap: d.smap ?? null,
        imerg: d.imerg ? d.imerg.year.map((y, i) => ({ year: y, month: d.imerg!.month[i], mm: d.imerg!.mm[i] })) : null,
        srtm: d.srtm, landcover: d.landcover,
      }));
      memo.set(key, p);
    }
    return p;
  }
  const lat = Math.round(ref.lat * 100) / 100;
  const lon = Math.round(ref.lon * 100) / 100;
  if (lat < BOUNDS.latMin || lat > BOUNDS.latMax || lon < BOUNDS.lonMin || lon > BOUNDS.lonMax) throw new LocationError("out_of_bounds");
  const key = keyOf(lat, lon);
  let p = memo.get(key);
  if (!p) {
    p = loadCustom(lat, lon, key).catch((e) => {
      memo.delete(key);
      throw e;
    });
    memo.set(key, p);
    if (memo.size > 200) memo.delete(memo.keys().next().value!);
  }
  return p;
}

export async function isCached(lat: number, lon: number): Promise<boolean> {
  const key = keyOf(Math.round(lat * 100) / 100, Math.round(lon * 100) / 100);
  if (memo.has(key)) return true;
  try {
    const db = await getDb();
    return (await db.query("select 1 from location_cache where key = $1", [key])).length > 0;
  } catch {
    return false;
  }
}

async function loadCustom(lat: number, lon: number, key: string): Promise<LocationData> {
  let power: RawPower | null = null;
  let srtm: LocationData["srtm"] = null;
  let fetchedAt = "";
  let db: Awaited<ReturnType<typeof getDb>> | null = null;
  try {
    db = await getDb();
    const rows = await db.query<{ power_gz: Uint8Array; srtm: LocationData["srtm"]; fetched_at: Date }>(
      "select power_gz, srtm, fetched_at from location_cache where key = $1 and fetched_at > now() - interval '30 days'", [key]);
    if (rows[0]) {
      power = JSON.parse(gunzipSync(Buffer.from(rows[0].power_gz)).toString("utf8"));
      srtm = rows[0].srtm;
      fetchedAt = new Date(rows[0].fetched_at).toISOString().slice(0, 10);
    }
  } catch (e) {
    console.error("[location cache]", e instanceof Error ? e.message : e);
  }
  if (!power) {
    [power, srtm] = await Promise.all([fetchPower(lat, lon), fetchSrtm(lat, lon).catch(() => null)]);
    fetchedAt = new Date().toISOString().slice(0, 10);
    if (db) {
      await db.query(
        `insert into location_cache (key, lat, lon, power_gz, srtm, fetched_at) values ($1, $2, $3, $4, $5, now())
         on conflict (key) do update set power_gz = excluded.power_gz, srtm = excluded.srtm, fetched_at = now()`,
        [key, lat, lon, gzipSync(JSON.stringify(power)), srtm ? JSON.stringify(srtm) : null],
      ).catch((e) => console.error("[location cache write]", e instanceof Error ? e.message : e));
    }
  }
  return {
    key, kind: "custom", region: null, name: key, lat, lon, zone: null, power,
    powerSource: `NASA POWER (downloaded ${fetchedAt})`, ndvi: null, smap: null, imerg: null, srtm, landcover: null,
  };
}

async function fetchPower(lat: number, lon: number): Promise<RawPower> {
  const end = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10).replaceAll("-", "");
  const url = new URL("https://power.larc.nasa.gov/api/temporal/daily/point");
  url.search = new URLSearchParams({
    parameters: POWER_COLS.join(","), community: "AG", longitude: String(lon), latitude: String(lat),
    start: "20010101", end, format: "JSON", "time-standard": "LST",
  }).toString();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(25_000), headers: { "User-Agent": "FieldShift/2.0 (crop-rotation advisory)" } });
      if (r.status >= 500 || r.status === 429) throw new Error(`POWER ${r.status}`);
      if (!r.ok) throw new LocationError("nasa_unavailable");
      const j = (await r.json()) as { header?: { fill_value?: number }; properties: { parameter: Record<string, Record<string, number>> } };
      const fill = j.header?.fill_value ?? -999;
      const params = j.properties.parameter;
      const dates = Object.keys(params.T2M).sort();
      const out: RawPower = { dates: [] };
      for (const c of POWER_COLS) out[c] = [];
      for (const d of dates) {
        const vals = POWER_COLS.map((c) => {
          const v = params[c]?.[d];
          return v === undefined || v === fill || v === -999 ? null : v;
        });
        if (vals.every((v) => v === null)) continue; // trailing fill-only days
        (out.dates as string[]).push(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`);
        POWER_COLS.forEach((c, i) => (out[c] as (number | null)[]).push(vals[i]));
      }
      if (out.dates.length < 3650) throw new LocationError("nasa_unavailable");
      return out;
    } catch (e) {
      if (e instanceof LocationError || attempt === 2) throw e instanceof LocationError ? e : new LocationError("nasa_unavailable");
      await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
    }
  }
  throw new LocationError("nasa_unavailable");
}

/** NASA SRTM 90 m on a 5 x 5 grid (~500 m spacing) → mean central-difference slope (%) — as pipeline/src/data_fetch.py */
async function fetchSrtm(lat: number, lon: number): Promise<LocationData["srtm"]> {
  const step = 0.0045;
  const pts: [number, number][] = [];
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) pts.push([lat + i * step, lon + j * step]);
  const url = `https://api.opentopodata.org/v1/srtm90m?locations=${pts.map(([a, b]) => `${a.toFixed(5)},${b.toFixed(5)}`).join("|")}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) return null;
  const j = (await r.json()) as { results: { elevation: number | null }[] };
  const z = j.results.map((p) => p.elevation);
  if (z.some((v) => v === null)) return null;
  const Z = (i: number, k: number) => z[i * 5 + k] as number;
  const dy = step * 111_000;
  const dx = step * 111_000 * Math.cos((lat * Math.PI) / 180);
  // numpy.gradient: central differences inside, one-sided at the edges
  const grad = (i: number, k: number, axis: 0 | 1) => {
    const n = 5;
    const idx = axis === 0 ? i : k;
    const at = (t: number) => (axis === 0 ? Z(t, k) : Z(i, t));
    const h = axis === 0 ? dy : dx;
    if (idx === 0) return (at(1) - at(0)) / h;
    if (idx === n - 1) return (at(n - 1) - at(n - 2)) / h;
    return (at(idx + 1) - at(idx - 1)) / (2 * h);
  };
  let s = 0;
  for (let i = 0; i < 5; i++) for (let k = 0; k < 5; k++) s += Math.hypot(grad(i, k, 0), grad(i, k, 1));
  const vals = z as number[];
  return { elevation_m: Z(2, 2), relief_m: Math.max(...vals) - Math.min(...vals), slope_pct: Math.round((s / 25) * 100 * 100) / 100 };
}

// --------------------------------------------------------------------------- prepared weather (memoised)
const dailyMemo = new Map<string, Daily>();

export async function dailyFor(loc: LocationData, scenario: Scenario): Promise<Daily> {
  const K = await getKnowledge();
  const k = `${loc.key}|${scenario.temp}|${scenario.rainPct}`;
  let d = dailyMemo.get(k);
  if (!d) {
    d = cleanPower(loc.power, loc.lat, K.constants, scenario);
    dailyMemo.set(k, d);
    if (dailyMemo.size > 60) dailyMemo.delete(dailyMemo.keys().next().value!);
  }
  return d;
}

export function lowDoys(loc: LocationData): Set<number> | null {
  if (!loc.ndvi || !loc.ndvi.length) return null;
  return windowDoys(lowVegetationWindows(ndviClimatology(loc.ndvi)).windows);
}

import type { Availability, Factor, Irrigation, MarketAnswer, Texture } from "@/lib/engine/types";

export const CROPS = ["rice", "wheat", "maize", "mungbean", "cotton"] as const;
export const REGIONS = ["faisalabad", "sheikhupura", "gujranwala", "hafizabad", "okara", "multan"] as const;
export const STANDARD: Record<string, string[]> = {
  rw: ["rice", "wheat"], rwm: ["rice", "wheat", "mungbean"], mw: ["maize", "wheat"], cw: ["cotton", "wheat"], mwm: ["maize", "wheat", "mungbean"],
};
export const IRR: Irrigation[] = ["Canal", "Tubewell", "Canal + tubewell", "Rainfed"];
export const AVAIL: Availability[] = ["Reliable", "Moderate", "Limited"];
export const TEX: Texture[] = ["sandy", "sandy loam", "loam", "silt loam", "clay loam", "silty clay loam", "clay"];
export const SAL = ["untested", "normal", "slight", "saline", "strong"] as const;
export const PRIORITIES: Record<string, Record<Factor, number>> = {
  balanced: { water: 5, soil: 3, climate: 2, soilfit: 2, calendar: 2, market: 2 },
  water: { water: 8, soil: 3, climate: 2, soilfit: 2, calendar: 2, market: 2 },
  soil: { water: 3, soil: 8, climate: 2, soilfit: 3, calendar: 2, market: 2 },
  climate: { water: 3, soil: 2, climate: 8, soilfit: 2, calendar: 3, market: 2 },
  market: { water: 3, soil: 2, climate: 2, soilfit: 2, calendar: 2, market: 8 },
};
export const SCENARIOS: Record<string, { temp: number; rainPct: number }> = {
  base: { temp: 0, rainPct: 0 }, warm: { temp: 1.5, rainPct: 0 }, dry: { temp: 0, rainPct: -10 }, both: { temp: 1.5, rainPct: -10 },
};
const MK: Record<string, MarketAnswer> = { Y: "Yes", U: "Unknown", N: "No" };

export interface AdvisorState {
  location: { region: string } | { lat: number; lon: number };
  current: string[];
  irrigation: Irrigation;
  availability: Availability;
  texture: Texture;
  salinity: (typeof SAL)[number];
  waterlogging: boolean;
  burns: boolean;
  priority: string; // a PRIORITIES key or "custom"
  weights: Record<Factor, number>;
  market: Record<string, MarketAnswer>;
  scenario: string;
  extra: string[][];
}

export const DEFAULT_STATE: AdvisorState = {
  location: { region: "faisalabad" }, current: ["rice", "wheat"], irrigation: "Canal + tubewell", availability: "Moderate",
  texture: "loam", salinity: "untested", waterlogging: false, burns: true, priority: "balanced", weights: PRIORITIES.balanced,
  market: { rice: "Yes", wheat: "Yes", maize: "Yes", mungbean: "Unknown", cotton: "Yes" }, scenario: "base", extra: [],
};

const validCrops = (s: string | null) => {
  const c = (s ?? "").split("-").filter((x) => (CROPS as readonly string[]).includes(x));
  return c.length >= 2 && c.length <= 4 && new Set(c).size === c.length ? c : null;
};

export function decode(sp: URLSearchParams): AdvisorState {
  const s = structuredClone(DEFAULT_STATE);
  const r = sp.get("r");
  const ll = sp.get("ll");
  if (r && (REGIONS as readonly string[]).includes(r)) s.location = { region: r };
  else if (ll) {
    const [lat, lon] = ll.split(",").map(Number);
    if (lat >= 23.5 && lat <= 37.2 && lon >= 60.8 && lon <= 77.9) s.location = { lat, lon };
  }
  s.current = validCrops(sp.get("c")) ?? s.current;
  const pick = <T,>(arr: readonly T[], v: string | null, d: T) => (v !== null && arr[Number(v)] !== undefined ? arr[Number(v)] : d);
  s.irrigation = pick(IRR, sp.get("i"), s.irrigation);
  s.availability = pick(AVAIL, sp.get("w"), s.availability);
  s.texture = pick(TEX, sp.get("s"), s.texture);
  const k = sp.get("k");
  if (k && (SAL as readonly string[]).includes(k)) s.salinity = k as AdvisorState["salinity"];
  s.waterlogging = sp.get("g") === "1";
  if (sp.has("b")) s.burns = sp.get("b") === "1";
  const p = sp.get("p");
  if (p && PRIORITIES[p]) {
    s.priority = p;
    s.weights = { ...PRIORITIES[p] };
  } else if (p === "custom") {
    const v = (sp.get("wt") ?? "").split(",").map(Number);
    if (v.length === 6 && v.every((x) => Number.isInteger(x) && x >= 0 && x <= 10)) {
      s.priority = "custom";
      s.weights = { water: v[0], soil: v[1], climate: v[2], soilfit: v[3], calendar: v[4], market: v[5] };
    }
  }
  const m = sp.get("m");
  if (m && /^[YUN]{5}$/.test(m)) CROPS.forEach((c, i) => (s.market[c] = MK[m[i]]));
  const sc = sp.get("sc");
  if (sc && SCENARIOS[sc]) s.scenario = sc;
  const x = sp.get("x");
  if (x) s.extra = x.split("_").map(validCrops).filter((v): v is string[] => v !== null).slice(0, 4);
  return s;
}

export function encode(s: AdvisorState): string {
  const q = new URLSearchParams();
  if ("region" in s.location) q.set("r", s.location.region);
  else q.set("ll", `${s.location.lat.toFixed(2)},${s.location.lon.toFixed(2)}`);
  q.set("c", s.current.join("-"));
  q.set("i", String(IRR.indexOf(s.irrigation)));
  q.set("w", String(AVAIL.indexOf(s.availability)));
  q.set("s", String(TEX.indexOf(s.texture)));
  if (s.salinity !== "untested") q.set("k", s.salinity);
  if (s.waterlogging) q.set("g", "1");
  q.set("b", s.burns ? "1" : "0");
  q.set("p", s.priority);
  if (s.priority === "custom") q.set("wt", [s.weights.water, s.weights.soil, s.weights.climate, s.weights.soilfit, s.weights.calendar, s.weights.market].join(","));
  const m = CROPS.map((c) => (s.market[c] ?? "Unknown")[0]).join("");
  if (m !== "YYYUY") q.set("m", m);
  if (s.scenario !== "base") q.set("sc", s.scenario);
  if (s.extra.length) q.set("x", s.extra.map((r) => r.join("-")).join("_"));
  return q.toString();
}

/** Body for POST /api/advice */
export function toAdviceInput(s: AdvisorState, lang: string) {
  const rotations = [...Object.values(STANDARD), ...s.extra];
  return {
    location: s.location,
    profile: {
      soilTexture: s.texture, salinity: s.salinity, waterlogging: s.waterlogging, irrigation: s.irrigation,
      waterAvailability: s.availability, burnsResidue: s.burns, market: s.market, weights: s.weights,
    },
    current: s.current,
    rotations,
    scenario: SCENARIOS[s.scenario],
    lang,
  };
}

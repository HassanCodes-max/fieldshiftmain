import "server-only";
import {
  compare, evaluateRotation, iso, soilHealthProfile, type Evaluation, type Fact, type Profile, type SoilHealthProfile,
} from "@/lib/engine";
import { SALINITY, type AdviceInput } from "@/lib/validation";
import { getKnowledge } from "./data";
import { dailyFor, lowDoys, resolveLocation, type LocationData } from "./location";
import { landSummary } from "./land";

export interface AdviceRotation {
  id: string;
  crops: string[];
  isCurrent: boolean;
  total: number;
  rank: number;
  scores: Evaluation["scores"];
  water: number | null;
  waterRange: [number | null, number | null];
  irrigations: number | null;
  confidence: Evaluation["confidence"];
  gated: boolean;
  gates: Fact[];
  schedule: { feasible: boolean; bareDays: number; firstCropLate: number; slots: { crop: string; sow: string; harvest: string; late: number }[] };
  perCrop: Evaluation["perCrop"];
  perYear: Evaluation["perYear"];
  benefits: Fact[];
  risks: Fact[];
  gaps: Fact[];
  evidence: Fact[];
  notes: Evaluation["notes"];
  bareCover: number | null;
  baselineYears: number[];
  soilHealth: SoilHealthProfile;
}

export interface AdviceResult {
  location: Pick<LocationData, "key" | "kind" | "region" | "name" | "lat" | "lon" | "zone" | "srtm" | "landcover" | "powerSource">;
  scenario: AdviceInput["scenario"];
  data: { ndvi: boolean; smap: boolean; imergBiasPct: number | null; years: [number, number] | null };
  rotations: AdviceRotation[];
  best: string;
  current: string;
  robustness: { factor: "water" | "soil" | "climate"; winner: string }[];
  computedMs: number;
}

const num = (x: number) => (Number.isFinite(x) ? x : null);
export const rotationId = (crops: string[], standard: { id: string; crops: string[] }[]) =>
  standard.find((r) => r.crops.join() === crops.join())?.id ?? `custom:${crops.join("-")}`;

export async function computeAdvice(input: AdviceInput): Promise<AdviceResult> {
  const t0 = performance.now();
  const K = await getKnowledge();
  const loc = await resolveLocation(input.location);
  const daily = await dailyFor(loc, input.scenario);
  const land = await landSummary(loc);
  const status = { ndvi: Boolean(loc.ndvi?.length), smap: Boolean(loc.smap), imergBiasPct: land.crosscheck?.biasPct ?? null };
  const p = input.profile;
  const salinityClass = SALINITY[p.salinity];
  const profile: Profile = {
    soilTexture: p.soilTexture, salinityClass, ece: K.constants.SALINITY_CLASSES[salinityClass] ?? null,
    waterlogging: p.waterlogging, zone: loc.zone, irrigation: p.irrigation, waterAvailability: p.waterAvailability,
    burnsResidue: p.burnsResidue, market: p.market as Profile["market"], weights: p.weights,
  };
  const sets = input.rotations?.length ? input.rotations : K.rotations.map((r) => r.crops);
  const keys = new Set<string>();
  const all = [input.current, ...sets].filter((ids) => {
    const k = ids.join();
    if (keys.has(k)) return false;
    keys.add(k);
    return true;
  });
  const low = lowDoys(loc);
  const evals = all.map((ids) => evaluateRotation(ids, profile, daily, K, low, status));
  const cur = evals[0];
  compare(evals, cur, K);
  const ranked = [...evals].sort((a, b) => b.total - a.total);
  const slope = loc.srtm?.slope_pct ?? null;
  const rotations: AdviceRotation[] = evals.map((e) => ({
    id: rotationId(e.crops, K.rotations),
    crops: e.crops,
    isCurrent: e === cur,
    total: e.total,
    rank: ranked.indexOf(e) + 1,
    scores: e.scores,
    water: num(e.water),
    waterRange: [num(e.waterRange[0]), num(e.waterRange[1])],
    irrigations: Number.isFinite(e.water) ? e.water / K.constants.IRRIGATION_DEPTH_MM : null,
    confidence: e.confidence,
    gated: e.gates.length > 0,
    gates: e.gates,
    schedule: {
      feasible: e.schedule.feasible, bareDays: e.schedule.bareDays, firstCropLate: e.schedule.firstCropLate,
      slots: e.schedule.slots.map((s) => ({ crop: s.crop, sow: iso(s.sow), harvest: iso(s.harvest), late: s.late })),
    },
    perCrop: e.perCrop, perYear: e.perYear, benefits: e.benefits, risks: e.risks, gaps: e.gaps, evidence: e.evidence,
    notes: e.notes, bareCover: e.bareCover, baselineYears: e.baselineYears,
    soilHealth: soilHealthProfile(e.crops, e.schedule.bareDays, p.soilTexture, p.burnsResidue, slope, K),
  }));
  rotations.sort((a, b) => a.rank - b.rank);
  const winner = (f: "water" | "soil" | "climate") => rotationId(evals.reduce((a, b) => (b.scores[f] > a.scores[f] ? b : a)).crops, K.rotations);
  return {
    location: { key: loc.key, kind: loc.kind, region: loc.region, name: loc.name, lat: loc.lat, lon: loc.lon, zone: loc.zone, srtm: loc.srtm, landcover: loc.landcover, powerSource: loc.powerSource },
    scenario: input.scenario,
    data: { ...status, years: cur.baselineYears.length ? [cur.baselineYears[0], cur.baselineYears.at(-1)!] : null },
    rotations,
    best: rotations[0].id,
    current: rotationId(cur.crops, K.rotations),
    robustness: (["water", "soil", "climate"] as const).map((f) => ({ factor: f, winner: winner(f) })),
    computedMs: Math.round(performance.now() - t0),
  };
}

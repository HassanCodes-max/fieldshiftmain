import { z } from "zod";
import { AVAILABILITY, IRRIGATION, MARKET, TEXTURES } from "@/lib/engine/types";

export const CROP_IDS = ["rice", "wheat", "maize", "mungbean", "cotton"] as const;
export const REGION_IDS = ["faisalabad", "sheikhupura", "gujranwala", "hafizabad", "okara", "multan"] as const;

/** Short codes for the soil-test salinity classes used by the engine (pipeline/src/soil_analysis.py). */
export const SALINITY = {
  untested: "Not tested",
  normal: "Normal (ECe < 4 dS/m)",
  slight: "Slightly saline (ECe 4–8 dS/m)",
  saline: "Saline (ECe 8–12 dS/m)",
  strong: "Strongly saline (> 12 dS/m)",
} as const;
export type SalinityCode = keyof typeof SALINITY;

const crop = z.enum(CROP_IDS);
const rotation = z.array(crop).min(2).max(4);
const weight = z.number().int().min(0).max(10);

export const LocationSchema = z.union([
  z.object({ region: z.enum(REGION_IDS) }).strict(),
  z.object({ lat: z.number().finite().min(23.5).max(37.2), lon: z.number().finite().min(60.8).max(77.9) }).strict(),
]);

export const ProfileSchema = z.object({
  soilTexture: z.enum(TEXTURES),
  salinity: z.enum(Object.keys(SALINITY) as [SalinityCode, ...SalinityCode[]]),
  waterlogging: z.boolean(),
  irrigation: z.enum(IRRIGATION),
  waterAvailability: z.enum(AVAILABILITY),
  burnsResidue: z.boolean(),
  market: z.partialRecord(crop, z.enum(MARKET)).default({}),
  weights: z.object({ water: weight, soil: weight, climate: weight, soilfit: weight, calendar: weight, market: weight }).strict(),
}).strict();

export const ScenarioSchema = z.object({
  temp: z.number().min(0).max(3),
  rainPct: z.number().int().min(-30).max(30),
}).strict();

export const AdviceSchema = z.object({
  location: LocationSchema,
  profile: ProfileSchema,
  current: rotation,
  rotations: z.array(rotation).max(8).optional(),
  scenario: ScenarioSchema.default({ temp: 0, rainPct: 0 }),
  lang: z.enum(["en", "ur"]).default("en"),
}).strict();
export type AdviceInput = z.infer<typeof AdviceSchema>;

export const PlanSchema = z.object({ advice: AdviceSchema }).strict();

export const FeedbackSchema = z.object({
  planId: z.string().regex(/^[A-Za-z0-9_-]{10}$/).optional(),
  helpful: z.boolean(),
  comment: z.string().trim().max(500).optional(),
  lang: z.enum(["en", "ur"]).default("en"),
  region: z.string().max(40).optional(),
}).strict();

export const PlanIdSchema = z.string().regex(/^[A-Za-z0-9_-]{10}$/);

export const CoordQuery = z.object({
  lat: z.coerce.number().finite().min(23.5).max(37.2),
  lon: z.coerce.number().finite().min(60.8).max(77.9),
});

export function parseLocationQuery(sp: URLSearchParams) {
  const region = sp.get("region");
  if (region) return LocationSchema.safeParse({ region });
  const c = CoordQuery.safeParse({ lat: sp.get("lat"), lon: sp.get("lon") });
  return c.success ? LocationSchema.safeParse(c.data) : c;
}

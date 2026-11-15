/** Shared types of the Field Shift engine (TypeScript port of pipeline/src). */

export const FACTORS = ["water", "soil", "climate", "soilfit", "calendar", "market"] as const;
export type Factor = (typeof FACTORS)[number];

export const TEXTURES = ["sandy", "sandy loam", "loam", "silt loam", "clay loam", "silty clay loam", "clay"] as const;
export type Texture = (typeof TEXTURES)[number];

export const IRRIGATION = ["Canal", "Tubewell", "Canal + tubewell", "Rainfed"] as const;
export type Irrigation = (typeof IRRIGATION)[number];

export const AVAILABILITY = ["Reliable", "Moderate", "Limited"] as const;
export type Availability = (typeof AVAILABILITY)[number];

export const MARKET = ["Yes", "Unknown", "No"] as const;
export type MarketAnswer = (typeof MARKET)[number];

export interface Crop {
  crop_id: string;
  name: string;
  name_ur: string;
  emoji: string;
  family: string;
  season: string;
  sow_start: string;
  sow_end: string;
  duration_days: number;
  kc_ini: number;
  kc_mid: number;
  kc_end: number;
  f_ini: number;
  f_dev: number;
  f_mid: number;
  f_late: number;
  heat_threshold_c: number;
  heat_stage: string;
  heat_day_from: number;
  heat_day_to: number;
  cold_threshold_c: number | null;
  cold_day_from: number | null;
  cold_day_to: number | null;
  rain_sensitive_stage: string | null;
  rain_day_from: number | null;
  rain_day_to: number | null;
  waterlog_sensitive: string;
  ece_threshold: number;
  ece_slope: number;
  textures_good: string;
  textures_ok: string;
  legume: string;
  puddled: string;
  residue_burning_risk: string;
  land_prep_mm: number;
  percolation_mm_day: number;
  bucket_mm: number;
  recommended_zones: string;
  notes: string;
  verification: string;
}

export interface Trait {
  crop_id: string;
  botanical_family: string;
  nitrogen_fixing: string;
  max_root_depth_m: string;
  root_type: string;
  soil_role: string;
  residue_cover: string;
  forage_value: string;
  forage_use: string;
  main_pests: string;
  pest_notes: string;
  soil_notes: string;
  source: string;
  verification: string;
}

export interface Region {
  id: string;
  name: string;
  district: string;
  lat: number;
  lon: number;
  zone: string;
  typicalRotation: string;
  note: string;
}

export interface Constants {
  BASELINE_YEARS: number;
  HOT_DAY_C: number;
  HEAVY_RAIN_MM: number;
  IRRIGATION_DEPTH_MM: number;
  TURNAROUND_DAYS: number;
  MAX_LATE_DAYS: number;
  RAIN_BIAS_WARN_PCT: number;
  WATER_SUPPLY_MM: Record<Availability, number>;
  WATER_SCORE_MAX_MM: number;
  BUCKET_MM: Record<string, number>;
  RICE_PERCOLATION: Record<string, number>;
  SALINITY_CLASSES: Record<string, number | null>;
  ASSUMED_ECE: number;
  TEXTURES: string[];
}

export interface Knowledge {
  crops: Record<string, Crop>;
  cropOrder: string[];
  rotations: { id: string; name: string; crops: string[]; description: string }[];
  regions: Region[];
  traits: Record<string, Trait>;
  constants: Constants;
}

/** Farm profile as the engine sees it (validated at the API boundary). */
export interface Profile {
  soilTexture: Texture;
  salinityClass: string;
  ece: number | null;
  waterlogging: boolean;
  zone: string | null;
  irrigation: Irrigation;
  waterAvailability: Availability;
  burnsResidue: boolean;
  market: Record<string, MarketAnswer>;
  weights: Record<Factor, number>;
}

/** A language-free statement; the UI renders it in English or Urdu. */
export interface Fact {
  k: string;
  [field: string]: string | number | boolean | string[] | number[] | null;
}

export interface Slot {
  crop: string;
  sow: number; // day number
  harvest: number;
  late: number;
  window: [number, number];
}

export interface Schedule {
  crops: string[];
  slots: Slot[];
  feasible: boolean;
  firstCropLate: number;
  bareDays: number;
  barePeriods: [number, number][];
  issues: Fact[];
}

export interface SeasonResult {
  cycleYear: number;
  crop: string;
  order: number;
  seasonStart: number;
  etc: number;
  rain: number;
  irrigation: number;
  irrigationEvents: number;
  excessRain: number;
  heat: number;
  cold: number;
  heavy: number;
  tmaxMean: number;
  soilRoot: number;
}

export interface PerCrop {
  crop: string;
  irrigation: number;
  irrigationMin: number;
  irrigationMax: number;
  etc: number;
  rain: number;
  heat: number;
  cold: number;
  heavy: number;
  tmaxMean: number;
  climate: number | null;
  heatFrac: number | null;
}

export interface Evaluation {
  crops: string[];
  schedule: Schedule;
  scores: Record<Factor, number>;
  total: number;
  perCrop: PerCrop[];
  perYear: { cycleYear: number; irrigation: number; heat: number }[];
  water: number;
  waterRange: [number, number];
  evidence: Fact[];
  benefits: Fact[];
  risks: Fact[];
  gaps: Fact[];
  confidence: "High" | "Medium" | "Low";
  notes: Record<Factor, Fact[]>;
  bareCover: number | null;
  baselineYears: number[];
  gates: Fact[];
}

export interface DataStatus {
  ndvi: boolean;
  smap: boolean;
  imergBiasPct: number | null;
}

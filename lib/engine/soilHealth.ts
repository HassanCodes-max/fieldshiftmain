/** Port of pipeline/src/soil_health.py — pest-cycle break, erosion risk (NASA SRTM), forage, crop roles. */
import type { Fact, Knowledge } from "./types";

export const LEVELS = ["Low", "Moderate", "High"] as const;
export type Level = (typeof LEVELS)[number];

const depth = (s: string) => Number(String(s).split("-").pop());

export interface SoilHealthProfile {
  pest: Level;
  pestFacts: Fact[];
  erosion: Level;
  erosionFacts: Fact[];
  forage: Level;
  forageFacts: Fact[];
  roles: Fact[];
  nFixing: boolean;
  deep: boolean;
  cover: boolean;
  families: number;
}

export function soilHealthProfile(ids: string[], bareDays: number, texture: string, burnsResidue: boolean,
  slopePct: number | null, K: Knowledge): SoilHealthProfile {
  const T = K.traits;
  const known = ids.filter((c) => T[c]);
  const fams = [...new Set(known.map((c) => T[c].botanical_family))];
  const grasses = known.filter((c) => T[c].botanical_family.startsWith("Poaceae"));

  // ---- pest-cycle break
  const pestFacts: Fact[] = [];
  let pest: number;
  if (fams.length === 1 && fams[0].startsWith("Poaceae")) {
    pest = 0;
    pestFacts.push({ k: "pest_grasses_only" });
    if (ids.includes("rice") && ids.includes("wheat")) pestFacts.push({ k: "pest_phalaris" });
    if (ids.includes("maize") && !ids.includes("rice")) {
      pest = 1;
      pestFacts.push({ k: "pest_maize_not_flooded" });
    }
  } else {
    pest = 2;
    pestFacts.push({ k: "pest_break", crops: ids.filter((c) => !grasses.includes(c)) });
  }
  if (ids.includes("cotton") && ids.includes("mungbean")) {
    pest = Math.min(pest, 1);
    pestFacts.push({ k: "pest_whitefly" });
  }

  // ---- erosion
  const erosionFacts: Fact[] = [];
  let ero: number;
  if (slopePct === null || slopePct === undefined) {
    ero = bareDays >= 90 ? 1 : 0;
    erosionFacts.push({ k: "ero_slope_unknown" });
  } else {
    ero = slopePct < 1 ? 0 : slopePct < 3 ? 1 : 2;
    erosionFacts.push({ k: "ero_slope", slope: slopePct, cls: slopePct < 1 ? "flat" : slopePct < 3 ? "gentle" : "sloping" });
  }
  if (bareDays >= 90) {
    ero = Math.max(ero, 1);
    erosionFacts.push({ k: "ero_bare", days: bareDays });
    if (texture === "sandy" || texture === "sandy loam") {
      ero = 2;
      erosionFacts.push({ k: "ero_wind" });
    }
  } else if (bareDays <= 40) {
    erosionFacts.push({ k: "ero_covered", days: bareDays });
  }
  if (burnsResidue) erosionFacts.push({ k: "ero_burning" });

  // ---- forage
  const fv = Object.fromEntries(known.map((c) => [c, T[c].forage_value]));
  const high = Object.entries(fv).filter(([, v]) => v === "high").map(([c]) => c);
  const forage = high.length >= 2 ? 2 : high.length || Object.values(fv).includes("medium") ? 1 : 0;
  const forageFacts: Fact[] = known.map((c) => ({ k: "forage_use", crop: c, value: T[c].forage_value }));

  // ---- roles
  const nfix = known.filter((c) => T[c].nitrogen_fixing === "yes");
  const deep = known.filter((c) => T[c].soil_role.includes("deep-rooting"));
  const cover = known.filter((c) => T[c].soil_role.includes("cover crop"));
  const roles: Fact[] = [];
  if (nfix.length) roles.push({ k: "role_nfix", crops: nfix });
  if (cover.length) roles.push({ k: "role_cover", crops: cover });
  if (deep.length) roles.push({ k: "role_deep", crops: deep, depth: Math.max(...deep.map((c) => depth(T[c].max_root_depth_m))) });
  if (ids.includes("rice")) roles.push({ k: "role_puddled" });
  if (!roles.length) roles.push({ k: "role_none" });

  return {
    pest: LEVELS[pest], pestFacts, erosion: LEVELS[ero], erosionFacts, forage: LEVELS[forage], forageFacts, roles,
    nFixing: nfix.length > 0, deep: deep.length > 0, cover: cover.length > 0, families: fams.length,
  };
}

/** Field Shift engine — pure TypeScript, no I/O. */
import type { Crop, Knowledge, Trait } from "./types";

export * from "./types";
export * from "./util";
export * from "./weather";
export * from "./rotation";
export * from "./climate";
export * from "./ndvi";
export * from "./soilHealth";

export interface KnowledgeJson {
  crops: Crop[];
  rotations: Knowledge["rotations"];
  regions: Knowledge["regions"];
  traits: Trait[];
  constants: Knowledge["constants"];
}

export function buildKnowledge(j: KnowledgeJson): Knowledge {
  return {
    crops: Object.fromEntries(j.crops.map((c) => [c.crop_id, c])),
    cropOrder: j.crops.map((c) => c.crop_id),
    rotations: j.rotations,
    regions: j.regions,
    traits: Object.fromEntries(j.traits.map((t) => [t.crop_id, t])),
    constants: j.constants,
  };
}

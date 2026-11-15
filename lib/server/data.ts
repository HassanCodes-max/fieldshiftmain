import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildKnowledge, type Knowledge, type KnowledgeJson, type NdviModel, type RawPower } from "@/lib/engine";

const GEN = join(process.cwd(), "data", "generated");

export interface DistrictFile {
  id: string;
  lat: number;
  lon: number;
  power: RawPower;
  powerMeta: Record<string, unknown>;
  ndvi: { dates: string[]; ndvi: (number | null)[] };
  smap?: { dates: string[]; sm: number[]; rec: boolean[] | null };
  imerg?: { year: number[]; month: number[]; mm: number[] };
  srtm: { elevation_m: number; relief_m: number; slope_pct: number } | null;
  landcover: { class_name: string; is_cropland: boolean; cropland_fraction: number; year: number } | null;
}

/*
 * The generated datasets ship with the deployment and never change at runtime, so they are read synchronously
 * once per server instance. Synchronous reads let pages that use them be fully prerendered (Cache Components
 * treats async file I/O during prerendering as uncached data).
 */
let knowledge: Knowledge | null = null;
let model: NdviModel | null = null;
const districts = new Map<string, DistrictFile>();

function readJson<T>(...parts: string[]): T {
  return JSON.parse(readFileSync(join(GEN, ...parts), "utf8")) as T;
}

export function knowledgeSync(): Knowledge {
  knowledge ??= buildKnowledge(readJson<KnowledgeJson>("knowledge.json"));
  return knowledge;
}

export async function getKnowledge(): Promise<Knowledge> {
  return knowledgeSync();
}

export async function getNdviModel(): Promise<NdviModel> {
  model ??= readJson<NdviModel>("ndvi_model.json");
  return model;
}

export async function getDistrict(id: string): Promise<DistrictFile> {
  if (!knowledgeSync().regions.some((r) => r.id === id)) throw new Error("unknown region");
  let d = districts.get(id);
  if (!d) {
    d = readJson<DistrictFile>("districts", `${id}.json`);
    districts.set(id, d);
  }
  return d;
}

export async function getPriceSeed(): Promise<{ commodity: string; crop: string; market: string; date: string; price: number }[]> {
  return readJson("prices_seed.json");
}

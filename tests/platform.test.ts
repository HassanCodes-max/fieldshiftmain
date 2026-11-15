/** Translations, AMIS scraper parity with the Python pipeline, input validation and forecast tips. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "@/lib/i18n/en";
import ur from "@/lib/i18n/ur";
import { FACTS, factText } from "@/lib/i18n/facts";
import { parseAmis } from "@/lib/server/market";
import { tips } from "@/lib/server/forecast";
import { AdviceSchema, FeedbackSchema, LocationSchema } from "@/lib/validation";

const root = join(__dirname, "..");
const src = (dir: string) => readdirSync(join(root, dir)).filter((f) => f.endsWith(".ts")).map((f) => readFileSync(join(root, dir, f), "utf8")).join("\n");

describe("every engine fact has English and Urdu text", () => {
  const code = src("lib/engine");
  const keys = [...new Set([...code.matchAll(/\bk: "([a-z_]+)"/g)].map((m) => m[1]))];
  it("finds the facts the engine can emit", () => expect(keys.length).toBeGreaterThan(50));
  for (const k of keys) {
    it(k, () => {
      expect(FACTS[k], `missing translation for ${k}`).toBeDefined();
    });
  }
  it("renders without throwing and Urdu has no Latin words", () => {
    const sample = { k: "heat", crop: "wheat", days: 15.5, of: 35, t: 32, stage: "grain filling", from: 20514, to: 20549 };
    expect(factText(sample, "en")).toContain("Wheat");
    const u = factText(sample, "ur");
    expect(u).toContain("گندم");
    expect(u).not.toMatch(/[A-Za-z]{3,}/);
  });
});

describe("dictionaries", () => {
  const keys = (o: unknown, p = ""): string[] =>
    o && typeof o === "object" && !Array.isArray(o) ? Object.entries(o).flatMap(([k, v]) => keys(v, `${p}${k}.`)) : [p];
  it("English and Urdu have exactly the same keys", () => expect(keys(ur).sort()).toEqual(keys(en).sort()));
  it("Urdu strings contain no English words (except proper data codes)", () => {
    const allowed = /^(ECe|r|ET₀|m³\/m³|Rs|NDVI|English|ltr|rtl|ur-PK-u-nu-arabext)$/;
    const walk = (o: unknown, path: string): string[] => {
      if (typeof o === "string") {
        const words = o.replace(/\{\w+\}/g, "").match(/[A-Za-z]{3,}/g) ?? [];
        return words.filter((w) => !allowed.test(w)).map((w) => `${path}: ${w}`);
      }
      if (Array.isArray(o)) return o.flatMap((v, i) => walk(v, `${path}[${i}]`));
      if (o && typeof o === "object") return Object.entries(o).flatMap(([k, v]) => (["dir", "locale"].includes(k) ? [] : walk(v, `${path}.${k}`)));
      return [];
    };
    expect(walk(ur, "ur").filter((x) => !x.startsWith("ur.nav.language"))).toEqual([]);
  });
});

describe("AMIS scraper matches pipeline/scripts/fetch_amis.py", () => {
  it("parses the same rows from the same page", () => {
    const html = readFileSync(join(root, "tests/fixtures/amis.html"), "latin1");
    const py = JSON.parse(readFileSync(join(root, "tests/fixtures/amis_python.json"), "utf8")) as { commodity: string; market: string; price: number; date: string }[];
    const ts = parseAmis(html);
    const key = (r: { commodity: string; market: string; price: number; date: string }) => `${r.commodity}|${r.market}|${r.date}|${r.price}`;
    expect(ts.map(key).sort()).toEqual(py.map(key).sort());
  });
});

describe("input validation", () => {
  const base = {
    location: { region: "okara" },
    profile: { soilTexture: "loam", salinity: "untested", waterlogging: false, irrigation: "Canal", waterAvailability: "Moderate", burnsResidue: true, market: {}, weights: { water: 5, soil: 3, climate: 2, soilfit: 2, calendar: 2, market: 2 } },
    current: ["rice", "wheat"],
  };
  it("accepts a valid request", () => expect(AdviceSchema.safeParse(base).success).toBe(true));
  it("rejects unknown fields", () => expect(AdviceSchema.safeParse({ ...base, admin: true }).success).toBe(false));
  it("rejects unknown crops and districts", () => {
    expect(AdviceSchema.safeParse({ ...base, current: ["rice", "sugarcane"] }).success).toBe(false);
    expect(LocationSchema.safeParse({ region: "lahore" }).success).toBe(false);
  });
  it("rejects coordinates outside Pakistan", () => expect(LocationSchema.safeParse({ lat: 51.5, lon: -0.1 }).success).toBe(false));
  it("rejects out-of-range weights and scenarios", () => {
    expect(AdviceSchema.safeParse({ ...base, profile: { ...base.profile, weights: { ...base.profile.weights, water: 99 } } }).success).toBe(false);
    expect(AdviceSchema.safeParse({ ...base, scenario: { temp: 10, rainPct: 0 } }).success).toBe(false);
  });
  it("limits feedback comments and plan ids", () => {
    expect(FeedbackSchema.safeParse({ helpful: true, comment: "x".repeat(501) }).success).toBe(false);
    expect(FeedbackSchema.safeParse({ helpful: true, planId: "../../etc" }).success).toBe(false);
  });
});

describe("forecast tips (same rules as before)", () => {
  const day = (date: string, rain: number, tmax = 30, tmin = 15) => ({ date, rain, tmax, tmin, rainProb: null });
  it("rain, heat and frost", () => {
    const t = tips([day("2026-11-15", 0), day("2026-11-16", 12, 41), day("2026-11-17", 0, 20, 1), day("2026-11-18", 35)]);
    expect(t.map((x) => x.k)).toEqual(["wx_heavy", "wx_rain", "wx_heat", "wx_cold"]);
  });
  it("dry week", () => expect(tips([day("2026-11-15", 0), day("2026-11-16", 1)]).map((x) => x.k)).toEqual(["wx_dry"]));
});

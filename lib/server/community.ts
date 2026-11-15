import "server-only";
import { randomBytes } from "node:crypto";
import type { AdviceInput } from "@/lib/validation";
import type { AdviceResult } from "./advice";
import { getDb } from "./db";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Unguessable 10-character id (~57 bits) for a shareable plan link. */
export function newPlanId(): string {
  const bytes = randomBytes(10);
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

export interface PlanSummary {
  best: string;
  current: string;
  ranking: { id: string; crops: string[]; total: number; water: number | null; confidence: string; gated: boolean }[];
  location: AdviceResult["location"];
}

export function summarize(r: AdviceResult): PlanSummary {
  return {
    best: r.best, current: r.current, location: r.location,
    ranking: r.rotations.map((x) => ({ id: x.id, crops: x.crops, total: Math.round(x.total * 10) / 10, water: x.water && Math.round(x.water), confidence: x.confidence, gated: x.gated })),
  };
}

export async function savePlan(input: AdviceInput, result: AdviceResult): Promise<string> {
  const db = await getDb();
  for (let i = 0; i < 3; i++) {
    const id = newPlanId();
    const rows = await db.query("insert into saved_plans (id, lang, input, summary) values ($1, $2, $3, $4) on conflict (id) do nothing returning id",
      [id, input.lang, JSON.stringify(input), JSON.stringify(summarize(result))]);
    if (rows.length) return id;
  }
  throw new Error("could not allocate a plan id");
}

export async function getPlan(id: string): Promise<{ id: string; lang: string; input: AdviceInput; summary: PlanSummary; createdAt: string; views: number } | null> {
  const db = await getDb();
  const rows = await db.query<{ id: string; lang: string; input: AdviceInput | string; summary: PlanSummary | string; created_at: Date; views: number }>(
    "update saved_plans set views = views + 1 where id = $1 returning id, lang, input, summary, created_at, views", [id]);
  const r = rows[0];
  if (!r) return null;
  const parse = <T>(v: T | string): T => (typeof v === "string" ? JSON.parse(v) : v);
  return { id: r.id, lang: r.lang, input: parse(r.input), summary: parse(r.summary), createdAt: new Date(r.created_at).toISOString(), views: r.views };
}

export async function addFeedback(f: { planId?: string; helpful: boolean; comment?: string; lang: string; region?: string }) {
  const db = await getDb();
  if (f.planId) {
    const exists = await db.query("select 1 from saved_plans where id = $1", [f.planId]);
    if (!exists.length) throw Object.assign(new Error("plan not found"), { status: 404 });
  }
  await db.query("insert into feedback (plan_id, helpful, comment, lang, region) values ($1, $2, $3, $4, $5)",
    [f.planId ?? null, f.helpful, f.comment || null, f.lang, f.region ?? null]);
}

export async function logAdvice(region: string | null, best: string, current: string, lang: string) {
  const db = await getDb();
  await db.query("insert into usage_events (kind, region, best, current_rotation, lang) values ('advice', $1, $2, $3, $4)",
    [region ?? "custom", best, current, lang]);
}

export interface Stats {
  adviceTotal: number;
  advice7d: number;
  plans: number;
  helpfulPct: number | null;
  feedbackN: number;
  byRegion: { region: string; n: number }[];
  bestRotations: { rotation: string; n: number }[];
  daily: { date: string; n: number }[];
  updated: string;
}

export async function getStats(): Promise<Stats> {
  const db = await getDb();
  const [tot, plans, fb, byRegion, best, daily] = await Promise.all([
    db.query<{ all: string; week: string }>("select count(*)::text as all, count(*) filter (where created_at > now() - interval '7 days')::text as week from usage_events where kind = 'advice'"),
    db.query<{ n: string }>("select count(*)::text as n from saved_plans"),
    db.query<{ n: string; yes: string }>("select count(*)::text as n, count(*) filter (where helpful)::text as yes from feedback"),
    db.query<{ region: string; n: string }>("select region, count(*)::text as n from usage_events where kind = 'advice' group by region order by count(*) desc limit 12"),
    db.query<{ rotation: string; n: string }>("select best as rotation, count(*)::text as n from usage_events where kind = 'advice' group by best order by count(*) desc limit 8"),
    db.query<{ date: string; n: string }>("select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date, count(*)::text as n from usage_events where kind = 'advice' and created_at > now() - interval '30 days' group by 1 order by 1"),
  ]);
  const fbn = Number(fb[0].n);
  return {
    adviceTotal: Number(tot[0].all), advice7d: Number(tot[0].week), plans: Number(plans[0].n),
    helpfulPct: fbn ? (100 * Number(fb[0].yes)) / fbn : null, feedbackN: fbn,
    byRegion: byRegion.map((r) => ({ region: r.region, n: Number(r.n) })),
    bestRotations: best.map((r) => ({ rotation: r.rotation, n: Number(r.n) })),
    daily: daily.map((r) => ({ date: r.date, n: Number(r.n) })),
    updated: new Date().toISOString(),
  };
}

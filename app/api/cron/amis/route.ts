import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/server/db";
import { json, problem } from "@/lib/server/http";
import { refreshAmis } from "@/lib/server/market";

export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") || "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Daily job (Vercel Cron, see vercel.json): store today's Punjab AMIS prices and prune old rate-limit rows. */
export async function GET(req: Request) {
  if (!authorized(req)) return problem(401, "unauthorized");
  const db = await getDb();
  try {
    const r = await refreshAmis();
    await db.query("insert into job_runs (job, ok, detail) values ('amis', true, $1)", [JSON.stringify(r)]);
    await db.query("delete from rate_limits where window_start < now() - interval '1 day'");
    return json({ ok: true, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 300) : "error";
    await db.query("insert into job_runs (job, ok, detail) values ('amis', false, $1)", [msg]).catch(() => {});
    console.error("[cron:amis]", msg);
    return problem(502, "amis_failed");
  }
}

import "server-only";
import { createHash } from "node:crypto";
import { getDb } from "./db";

/** Fixed-window rate limit shared by all server instances (stored in Postgres). Falls back to per-instance memory. */
const memory = new Map<string, { start: number; count: number }>();

export function clientKey(req: Request): string {
  const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  // the address is hashed with a server-side salt so raw IPs are never stored
  return createHash("sha256").update(`${process.env.RATE_LIMIT_SALT || "fieldshift"}:${ip}`).digest("hex").slice(0, 32);
}

export async function rateLimit(req: Request, bucket: string, limit: number, windowSec: number): Promise<{ ok: boolean; retryAfter: number }> {
  const key = `${bucket}:${clientKey(req)}`;
  const now = Date.now();
  const start = Math.floor(now / (windowSec * 1000)) * windowSec * 1000;
  const retryAfter = Math.ceil((start + windowSec * 1000 - now) / 1000);
  try {
    const db = await getDb();
    const rows = await db.query<{ count: number }>(
      `insert into rate_limits (key, window_start, count) values ($1, $2, 1)
       on conflict (key) do update set
         count = case when rate_limits.window_start = excluded.window_start then rate_limits.count + 1 else 1 end,
         window_start = excluded.window_start
       returning count`,
      [key, new Date(start).toISOString()],
    );
    return { ok: Number(rows[0].count) <= limit, retryAfter };
  } catch {
    const m = memory.get(key);
    if (!m || m.start !== start) memory.set(key, { start, count: 1 });
    else m.count++;
    if (memory.size > 5000) memory.clear();
    return { ok: (memory.get(key)?.count ?? 1) <= limit, retryAfter };
  }
}

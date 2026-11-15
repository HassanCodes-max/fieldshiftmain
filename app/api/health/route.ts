import { getDb } from "@/lib/server/db";
import { json } from "@/lib/server/http";

/** GET /api/health — liveness and database connectivity (no internal details). */
export async function GET() {
  const t0 = performance.now();
  let database: "ok" | "unavailable" = "unavailable";
  try {
    const db = await getDb();
    await db.query("select 1");
    database = "ok";
  } catch {
    database = "unavailable";
  }
  return json(
    { status: database === "ok" ? "ok" : "degraded", database, ms: Math.round(performance.now() - t0), env: process.env.VERCEL_ENV ?? process.env.NODE_ENV },
    { status: database === "ok" ? 200 : 503 },
  );
}

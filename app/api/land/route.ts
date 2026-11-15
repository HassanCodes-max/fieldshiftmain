import { fail, json, problem, rateLimited } from "@/lib/server/http";
import { landReport } from "@/lib/server/land";
import { isCached, resolveLocation } from "@/lib/server/location";
import { rateLimit } from "@/lib/server/rateLimit";
import { parseLocationQuery } from "@/lib/validation";

export const maxDuration = 60;

/** GET /api/land?region=okara  or  ?lat=31.1&lon=72.9 — NASA climate, vegetation and soil-moisture report. */
export async function GET(req: Request) {
  const q = parseLocationQuery(new URL(req.url).searchParams);
  if (!q.success) return problem(422, "invalid_location");
  const loc = q.data as { region: string } | { lat: number; lon: number };
  if ("lat" in loc && !(await isCached(loc.lat, loc.lon))) {
    const rl = await rateLimit(req, "nasa", 12, 3600);
    if (!rl.ok) return rateLimited(rl.retryAfter);
  }
  try {
    const report = await landReport(await resolveLocation(loc));
    return json(report, { cache: "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" });
  } catch (e) {
    return fail(e, "land");
  }
}

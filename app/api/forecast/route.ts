import { getForecast } from "@/lib/server/forecast";
import { json, problem } from "@/lib/server/http";
import { CoordQuery } from "@/lib/validation";

/** GET /api/forecast?lat=&lon= — 7-day forecast with farm tips (server-cached for an hour). */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = CoordQuery.safeParse({ lat: sp.get("lat"), lon: sp.get("lon") });
  if (!q.success) return problem(422, "invalid_location");
  const f = await getForecast(Math.round(q.data.lat * 100) / 100, Math.round(q.data.lon * 100) / 100);
  if (!f) return problem(503, "forecast_unavailable");
  return json(f, { cache: "public, max-age=600, s-maxage=1800" });
}

import { toMonthly } from "@/lib/engine";
import { fail, problem } from "@/lib/server/http";
import { dailyFor, resolveLocation } from "@/lib/server/location";
import { parseLocationQuery } from "@/lib/validation";

const COLS = ["year", "month", "tmax", "tmin", "tmean", "rain", "et0", "rh", "soilRoot", "soilTop", "solar", "hotDays", "heavyRainDays", "nDays"] as const;

/** GET /api/land/csv?region=… — monthly NASA POWER table as CSV (preset districts). */
export async function GET(req: Request) {
  const q = parseLocationQuery(new URL(req.url).searchParams);
  if (!q.success || !("region" in (q.data as object))) return problem(422, "invalid_location");
  try {
    const loc = await resolveLocation(q.data as { region: string });
    const m = toMonthly(await dailyFor(loc, { temp: 0, rainPct: 0 }));
    const fmt = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "");
    const csv = [COLS.join(","), ...m.map((r) => COLS.map((c) => fmt(r[c])).join(","))].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="fieldshift_${loc.region}_nasa_power_monthly.csv"`,
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return fail(e, "land-csv");
  }
}

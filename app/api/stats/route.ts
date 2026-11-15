import { getStats } from "@/lib/server/community";
import { fail, json } from "@/lib/server/http";

/** GET /api/stats — anonymous platform activity (advice runs, saved plans, feedback). */
export async function GET() {
  try {
    return json(await getStats(), { cache: "public, max-age=30, s-maxage=30" });
  } catch (e) {
    return fail(e, "stats");
  }
}

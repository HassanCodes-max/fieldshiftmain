import { fail, json } from "@/lib/server/http";
import { marketSummary } from "@/lib/server/market";

/** GET /api/market — latest Punjab AMIS wholesale prices and price history (from the database). */
export async function GET() {
  try {
    return json(await marketSummary(), { cache: "public, max-age=300, s-maxage=900" });
  } catch (e) {
    return fail(e, "market");
  }
}

import { after } from "next/server";
import { computeAdvice } from "@/lib/server/advice";
import { logAdvice } from "@/lib/server/community";
import { fail, json, rateLimited, readBody } from "@/lib/server/http";
import { isCached } from "@/lib/server/location";
import { rateLimit } from "@/lib/server/rateLimit";
import { AdviceSchema } from "@/lib/validation";

export const maxDuration = 60;

/** POST /api/advice — run the rotation engine for a farm profile and return the ranked rotations. */
export async function POST(req: Request) {
  const body = await readBody(req, AdviceSchema);
  if (!body.ok) return body.res;
  const input = body.data;
  const rl = await rateLimit(req, "advice", 90, 60);
  if (!rl.ok) return rateLimited(rl.retryAfter);
  if ("lat" in input.location && !(await isCached(input.location.lat, input.location.lon))) {
    // a new map location downloads 25 years of NASA data: limit how often one visitor can do that
    const nasa = await rateLimit(req, "nasa", 12, 3600);
    if (!nasa.ok) return rateLimited(nasa.retryAfter);
  }
  try {
    const result = await computeAdvice(input);
    after(() => logAdvice(result.location.region, result.best, result.current, input.lang).catch(() => {}));
    return json(result);
  } catch (e) {
    return fail(e, "advice");
  }
}

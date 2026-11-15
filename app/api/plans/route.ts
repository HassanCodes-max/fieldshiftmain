import { computeAdvice } from "@/lib/server/advice";
import { savePlan } from "@/lib/server/community";
import { fail, json, rateLimited, readBody } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rateLimit";
import { PlanSchema } from "@/lib/validation";

export const maxDuration = 60;

/** POST /api/plans — recompute the advice on the server and store it under a short shareable id. */
export async function POST(req: Request) {
  const body = await readBody(req, PlanSchema);
  if (!body.ok) return body.res;
  const rl = await rateLimit(req, "plans", 20, 3600);
  if (!rl.ok) return rateLimited(rl.retryAfter);
  try {
    // never trust a client-sent result: the stored summary is computed here
    const result = await computeAdvice(body.data.advice);
    const id = await savePlan(body.data.advice, result);
    return json({ id }, { status: 201 });
  } catch (e) {
    return fail(e, "plans");
  }
}

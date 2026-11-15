import { getPlan } from "@/lib/server/community";
import { fail, json, problem } from "@/lib/server/http";
import { PlanIdSchema } from "@/lib/validation";

/** GET /api/plans/:id — a saved plan. */
export async function GET(_req: Request, ctx: RouteContext<"/api/plans/[id]">) {
  const { id } = await ctx.params;
  if (!PlanIdSchema.safeParse(id).success) return problem(404, "not_found");
  try {
    const plan = await getPlan(id);
    return plan ? json(plan) : problem(404, "not_found");
  } catch (e) {
    return fail(e, "plan");
  }
}

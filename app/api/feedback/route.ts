import { addFeedback } from "@/lib/server/community";
import { fail, json, rateLimited, readBody } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rateLimit";
import { FeedbackSchema } from "@/lib/validation";

/** POST /api/feedback — was this advice helpful? (optional short comment) */
export async function POST(req: Request) {
  const body = await readBody(req, FeedbackSchema);
  if (!body.ok) return body.res;
  const rl = await rateLimit(req, "feedback", 10, 3600);
  if (!rl.ok) return rateLimited(rl.retryAfter);
  try {
    await addFeedback(body.data);
    return json({ ok: true }, { status: 201 });
  } catch (e) {
    return fail(e, "feedback");
  }
}

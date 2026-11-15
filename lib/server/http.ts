import "server-only";
import type { z } from "zod";
import { LocationError } from "./location";

const MAX_BODY = 32 * 1024;

export function json(data: unknown, init: ResponseInit & { cache?: string } = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", init.cache ?? "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function problem(status: number, code: string, extra: Record<string, unknown> = {}, headers: HeadersInit = {}): Response {
  return json({ error: code, ...extra }, { status, headers });
}

/** Read and validate a JSON body (size-limited, schema-checked). */
export async function readBody<S extends z.ZodType>(req: Request, schema: S): Promise<{ ok: true; data: z.infer<S> } | { ok: false; res: Response }> {
  const type = req.headers.get("content-type") || "";
  if (!type.includes("application/json")) return { ok: false, res: problem(415, "unsupported_media_type") };
  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BODY) return { ok: false, res: problem(413, "payload_too_large") };
  const text = await req.text();
  if (text.length > MAX_BODY) return { ok: false, res: problem(413, "payload_too_large") };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, res: problem(400, "invalid_json") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, res: problem(422, "invalid_input", { issues: parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })) }) };
  }
  return { ok: true, data: parsed.data };
}

/** Map internal errors to safe responses (no stack traces or internal details). */
export function fail(e: unknown, where: string): Response {
  if (e instanceof LocationError) {
    const status = e.code === "nasa_unavailable" ? 503 : 422;
    return problem(status, e.code);
  }
  const fact = (e as { fact?: { k: string } })?.fact;
  if (fact) return problem(422, "invalid_rotation", { fact });
  const status = (e as { status?: number })?.status;
  if (status === 404) return problem(404, "not_found");
  if (e instanceof Error && e.message === "DATABASE_NOT_CONFIGURED") return problem(503, "database_not_configured");
  console.error(`[api:${where}]`, e);
  return problem(500, "internal_error");
}

export const rateLimited = (retryAfter: number) => problem(429, "rate_limited", { retryAfter }, { "Retry-After": String(retryAfter) });

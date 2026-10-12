import { timingSafeEqual } from "node:crypto";
import { ZodError } from "zod";
import { PayPalApiError } from "./paypal/client";
import { getEnv, sandboxToolsEnabled } from "./env";

export function requireSandboxTools(request: Request) {
  if (!sandboxToolsEnabled()) return Response.json({ error: "Not found" }, { status: 404 });
  const origin = request.headers.get("origin");
  if (origin !== new URL(getEnv().APP_URL).origin) return Response.json({ error: "Invalid origin" }, { status: 403 });
}
export function validBearer(request: Request) {
  const expected = Buffer.from(`Bearer ${getEnv().JOBS_BEARER}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function apiError(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: "Invalid request" }, { status: 400 });
  if (error instanceof PayPalApiError) return Response.json({ error: error.name, debug_id: error.debug_id, issues: error.details.map((d) => d.issue) }, { status: error.status >= 500 ? 502 : error.status });
  return Response.json({ error: "Request failed" }, { status: 500 });
}

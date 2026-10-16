import { getEnv } from "@/lib/env";
import { sanitizeCspReport } from "@/lib/csp-report";
import { allowRequest } from "@/lib/rate-limit";
import { readJson } from "@/lib/studio/api-actor";
export async function POST(req: Request) {
  const sink = getEnv().SENTRY_CSP_REPORT_URL;
  if (!sink) return new Response(null, { status: 204 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!allowRequest(`csp:${ip}`, 30))
    return new Response(null, { status: 429 });
  try {
    const body = sanitizeCspReport(await readJson(req, 16384));
    if (!body) return new Response(null, { status: 400 });
    const r = await fetch(sink, {
      method: "POST",
      headers: { "content-type": "application/csp-report" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
    return new Response(null, { status: r.ok ? 204 : 502 });
  } catch {
    return new Response(null, { status: 400 });
  }
}

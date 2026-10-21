import { cachedStatus } from "@/lib/status";
import { allowRequest, clientIp, limited } from "@/lib/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Machine-readable twin of /status for uptime monitors and the daily check. */
export async function GET(request: Request) {
  if (!allowRequest(`status:${clientIp(request)}`, 60)) return limited();
  try {
    const status = await cachedStatus();
    return Response.json(
      {
        overall: status.overall,
        checkedAt: status.checkedAt,
        ...Object.fromEntries(status.rows.map((r) => [r.key, r.health === "ok" ? "ok" : r.health])),
        rows: status.rows,
      },
      { status: status.overall === "down" ? 503 : 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ overall: "down", database: "unavailable" }, { status: 503 });
  }
}

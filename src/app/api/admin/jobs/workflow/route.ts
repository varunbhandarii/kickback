import { validBearer } from "@/lib/http";
import { triggerReconcile } from "@/lib/workflow-trigger";
export async function POST(req: Request) {
  if (!validBearer(req))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await triggerReconcile(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    // Operator-only: say why so a revoked key or wrong slug is obvious.
    return Response.json(
      {
        error: "Workflow unavailable; cron fallback remains active",
        cause: e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 300) : "unknown",
      },
      { status: 502 },
    );
  }
}

import { validBearer } from "@/lib/http";
import { triggerReconcile } from "@/lib/workflow-trigger";
export async function POST(req: Request) {
  if (!validBearer(req))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await triggerReconcile(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Workflow unavailable; cron fallback remains active" },
      { status: 502 },
    );
  }
}

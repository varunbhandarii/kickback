import { runView } from "@/lib/demo/runs";
import { allowRequest, clientIp, limited } from "@/lib/rate-limit";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!allowRequest(`demo-run-view:${clientIp(request)}`, 120)) return limited();
  const run = await runView((await params).id);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  return Response.json(run, { headers: { "Cache-Control": "no-store" } });
}

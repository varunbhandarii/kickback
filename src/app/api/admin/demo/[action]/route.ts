import { validBearer } from "@/lib/http";
import { sandboxToolsEnabled } from "@/lib/env";
import { setDemoPathsOff } from "@/lib/demo/runs";
import { stageDemoBuyers } from "@/lib/demo/staging";
import { clientIp } from "@/lib/rate-limit";
export const runtime = "nodejs";
export const maxDuration = 60;
/**
 * `pause` / `resume` the demo payment paths without a deploy; `stage` runs one
 * staging pass now; `ip` shows which client-IP headers this host receives, to
 * confirm the rate-limit key can't be spoofed.
 */
export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  if (!sandboxToolsEnabled()) return Response.json({ error: "Not found" }, { status: 404 });
  if (!validBearer(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { action } = await params;
  if (action === "pause" || action === "resume") return Response.json(await setDemoPathsOff(action === "pause"));
  if (action === "stage") return Response.json(await stageDemoBuyers());
  if (action === "ip")
    return Response.json({
      chosen: clientIp(request),
      cfConnectingIp: request.headers.get("cf-connecting-ip"),
      trueClientIp: request.headers.get("true-client-ip"),
      xForwardedFor: request.headers.get("x-forwarded-for"),
    });
  return Response.json({ error: "Not found" }, { status: 404 });
}

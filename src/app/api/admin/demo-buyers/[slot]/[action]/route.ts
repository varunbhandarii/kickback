import { apiError, validBearer } from "@/lib/http";
import { sandboxToolsEnabled } from "@/lib/env";
import { finishBuyerVault, startBuyerVault } from "@/lib/demo/vault";
export const runtime = "nodejs";
export const maxDuration = 60;
/** `setup` and `finish` save a buyer's wallet. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slot: string; action: string }> },
) {
  if (!sandboxToolsEnabled()) return Response.json({ error: "Not found" }, { status: 404 });
  if (!validBearer(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { slot, action } = await params,
    n = Number(slot);
  if (!Number.isInteger(n) || n < 0 || n > 99) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    if (action === "setup") return Response.json(await startBuyerVault(n));
    if (action === "finish") return Response.json(await finishBuyerVault(n));
    return Response.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    if (e instanceof Error && !("status" in e))
      return Response.json({ error: e.message }, { status: 409 });
    return apiError(e);
  }
}

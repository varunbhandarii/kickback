import { apiError, validBearer } from "@/lib/http";
import { sandboxToolsEnabled } from "@/lib/env";
import { buyerInput, listBuyers, poolCounts, upsertBuyer } from "@/lib/demo/buyers";
export const runtime = "nodejs";
function guard(request: Request) {
  if (!sandboxToolsEnabled()) return Response.json({ error: "Not found" }, { status: 404 });
  if (!validBearer(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
}
/** The demo buyer pool, without wallets or customer keys. */
export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  return Response.json({ buyers: await listBuyers(), counts: await poolCounts() });
}
/** Registers a buyer, or changes its purpose, publication or status. */
export async function POST(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  try {
    return Response.json(await upsertBuyer(buyerInput.parse(await request.json())));
  } catch (e) {
    return apiError(e);
  }
}

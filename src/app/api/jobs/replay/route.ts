import { z } from "zod";
import { validBearer, apiError } from "@/lib/http";
import { sandboxToolsEnabled } from "@/lib/env";
import { replay } from "@/lib/payments/replay";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  if (!sandboxToolsEnabled()) return Response.json({ error: "Not found" },{ status: 404 });
  if (!validBearer(request)) return Response.json({ error: "Unauthorized" },{ status: 401 });
  try { const input = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,64}$/),count: z.number().int().min(1).max(4),amount: z.string(),vaultId: z.string().min(1).max(128),historical: z.boolean().default(false) }).parse(await request.json()); return Response.json({ results: await replay(input) }); } catch (e) { return apiError(e); }
}

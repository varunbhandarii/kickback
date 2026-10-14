import { z } from "zod";
import { validBearer } from "@/lib/http";
import { sandboxToolsEnabled } from "@/lib/env";
import { seedHistory } from "@/lib/demo/history";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!sandboxToolsEnabled())
    return Response.json({ error: "Not found" }, { status: 404 });
  if (!validBearer(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const p = z
      .strictObject({
        merchant: z.string().regex(/^[a-z0-9-]{3,40}$/),
        category: z.enum(["cafe", "bakery", "salon", "other"]).default("cafe"),
        customers: z.number().int().min(1).max(500).default(150),
        days: z.number().int().min(1).max(90).default(90),
        clear: z.boolean().default(false),
      })
      .parse(await request.json());
    return Response.json(
      await seedHistory(p.merchant, p.category, p.customers, p.days, p.clear),
    );
  } catch {
    return Response.json(
      { error: "Synthetic history unavailable" },
      { status: 400 },
    );
  }
}

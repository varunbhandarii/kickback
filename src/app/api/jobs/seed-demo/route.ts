import { validBearer } from "@/lib/http";
import { sandboxToolsEnabled } from "@/lib/env";
import { seedDemo } from "@/lib/db/seed-demo";
export const runtime = "nodejs";
export async function POST(request: Request) { if (!sandboxToolsEnabled()) return Response.json({ error: "Not found" },{ status: 404 }); if (!validBearer(request)) return Response.json({ error: "Unauthorized" },{ status: 401 }); try { return Response.json(await seedDemo()); } catch { return Response.json({ error: "Seed configuration unavailable" },{ status: 503 }); } }

import { validBearer } from "@/lib/http";
import { runJobs } from "@/lib/jobs";
export const runtime = "nodejs";
export async function POST(request: Request) { if (!validBearer(request)) return Response.json({ error: "Unauthorized" },{ status: 401 }); try { return Response.json(await runJobs()); } catch { return Response.json({ error: "Jobs unavailable" },{ status: 503 }); } }

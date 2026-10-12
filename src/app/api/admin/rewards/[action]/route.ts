import { validBearer } from "@/lib/http";
import { pauseAll } from "@/lib/ops";
export async function POST(request: Request,{ params }: { params: Promise<{ action: string }> }) { if (!validBearer(request)) return Response.json({ error: "Unauthorized" },{ status: 401 }); const { action } = await params; if (!["pause","resume"].includes(action)) return Response.json({ error: "Not found" },{ status: 404 }); return Response.json(await pauseAll(action === "pause")); }

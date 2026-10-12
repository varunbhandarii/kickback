import { validBearer } from "@/lib/http";
import { pauseMerchant } from "@/lib/ops";
export const runtime = "nodejs";
export async function POST(request: Request,{ params }: { params: Promise<{ slug: string; action: string }> }) { if (!validBearer(request)) return Response.json({ error: "Unauthorized" },{ status: 401 }); const { slug,action } = await params; if (!["pause","resume"].includes(action)) return Response.json({ error: "Not found" },{ status: 404 }); const result = await pauseMerchant(slug,action === "pause"); return result ? Response.json(result) : Response.json({ error: "Not found" },{ status: 404 }); }

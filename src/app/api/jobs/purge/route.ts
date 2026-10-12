import { purgeRawEvents } from "@/lib/db/purge";
import { validBearer } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!validBearer(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try { return Response.json({ ok: true, deleted: await purgeRawEvents() }); }
  catch { return Response.json({ error: "Storage unavailable" }, { status: 503 }); }
}

import { apiActor, apiFailure, privateJson } from "@/lib/studio/api-actor";
import { listThreads } from "@/lib/studio/threads";
export async function GET(req: Request) {
  try {
    const a = await apiActor(req, { allowViewer: true });
    // Demo visitors share one account; their conversations are never stored.
    if (a.role !== "OWNER") return privateJson([]);
    return privateJson(await listThreads(a.merchantId));
  } catch (e) {
    return apiFailure(e);
  }
}

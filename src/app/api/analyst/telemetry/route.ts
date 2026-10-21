import {
  apiActor,
  apiFailure,
  readJson,
  privateJson,
  ApiError,
} from "@/lib/studio/api-actor";
import { saveTelemetry, telemetrySchema } from "@/lib/studio/telemetry-server";
export async function POST(req: Request) {
  try {
    const a = await apiActor(req, { allowViewer: true }),
      parsed = telemetrySchema.safeParse(await readJson(req, 65536));
    if (!parsed.success) throw new ApiError(400, "Invalid usage counters");
    // Demo visitors' counters would blur the business's own usage.
    if (a.role === "OWNER") await saveTelemetry(a.merchantId, parsed.data);
    return privateJson({ ok: true });
  } catch (e) {
    return apiFailure(e);
  }
}

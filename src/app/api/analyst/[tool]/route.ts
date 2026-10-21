import { z } from "zod";
import {
  apiActor,
  apiFailure,
  privateJson,
  readJson,
} from "@/lib/studio/api-actor";
import { analystRequest } from "@/lib/studio/analyst-server";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ tool: string }> },
) {
  try {
    const actor = await apiActor(req, {
        allowViewer: true,
        perMinute: ["analyst-tool", 30],
      }),
      { tool } = await params;
    return privateJson(await analystRequest(tool, await readJson(req), actor));
  } catch (e) {
    if (e instanceof z.ZodError) return privateJson({ error: e.issues }, 400);
    if (
      e instanceof Error &&
      ["TENANT_MISMATCH", "NOT_AUTHORIZED"].includes(e.message)
    )
      return privateJson({ error: "Not authorized" }, 403);
    return apiFailure(e);
  }
}

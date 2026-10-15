import { z } from "zod";
import {
  apiActor,
  apiFailure,
  privateJson,
  readJson,
} from "@/lib/studio/api-actor";
import { loadThread, saveThread, deleteThread } from "@/lib/studio/threads";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, { params }: Context) {
  try {
    const a = await apiActor(req),
      { id } = await params,
      t = await loadThread(a.merchantId, id);
    return t ? privateJson(t) : privateJson({ error: "Thread not found" }, 404);
  } catch (e) {
    return apiFailure(e);
  }
}
export async function PUT(req: Request, { params }: Context) {
  try {
    const a = await apiActor(req),
      { id } = await params;
    await saveThread(a.merchantId, id, await readJson(req));
    return privateJson({ ok: true });
  } catch (e) {
    return e instanceof z.ZodError
      ? privateJson({ error: "Invalid thread" }, 400)
      : apiFailure(e);
  }
}
export async function DELETE(req: Request, { params }: Context) {
  try {
    const a = await apiActor(req),
      { id } = await params;
    await deleteThread(a.merchantId, id);
    return privateJson({ ok: true });
  } catch (e) {
    return apiFailure(e);
  }
}

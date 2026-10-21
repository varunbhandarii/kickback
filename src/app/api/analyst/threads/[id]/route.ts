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
    const a = await apiActor(req, { allowViewer: true }),
      { id } = await params,
      t = a.role === "OWNER" ? await loadThread(a.merchantId, id) : undefined;
    return t ? privateJson(t) : privateJson({ error: "Thread not found" }, 404);
  } catch (e) {
    return apiFailure(e);
  }
}
export async function PUT(req: Request, { params }: Context) {
  try {
    const a = await apiActor(req, { allowViewer: true }),
      { id } = await params,
      body = await readJson(req);
    if (a.role === "OWNER") await saveThread(a.merchantId, id, body);
    return privateJson({ ok: true });
  } catch (e) {
    return e instanceof z.ZodError
      ? privateJson({ error: "Invalid thread" }, 400)
      : apiFailure(e);
  }
}
export async function DELETE(req: Request, { params }: Context) {
  try {
    const a = await apiActor(req, { allowViewer: true }),
      { id } = await params;
    if (a.role === "OWNER") await deleteThread(a.merchantId, id);
    return privateJson({ ok: true });
  } catch (e) {
    return apiFailure(e);
  }
}

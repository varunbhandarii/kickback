import "server-only";
import { cookies } from "next/headers";
import { getSession, ownedMerchant } from "../dal";
import { getEnv } from "../env";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function apiActor(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  if (site && !["same-origin", "none"].includes(site))
    throw new ApiError(403, "Cross-site request rejected");
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(getEnv().APP_URL).origin)
    throw new ApiError(403, "Origin rejected");
  const session = await getSession();
  if (!session) throw new ApiError(401, "Sign in required");
  const selected = (await cookies()).get("kickback.merchant")?.value;
  const merchant = await ownedMerchant(session.user.id, selected);
  if (!merchant || merchant.purgeAfter || merchant.status === "DISCONNECTED")
    throw new ApiError(403, "Business unavailable");
  return { userId: session.user.id, merchantId: merchant.id, merchant };
}
export async function readJson(req: Request, limit = 262144): Promise<unknown> {
  if (Number(req.headers.get("content-length")) > limit)
    throw new ApiError(413, "Request too large");
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "JSON body required");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        await reader.cancel();
        throw new ApiError(413, "Request too large");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, "Invalid JSON");
  }
}
export const privateJson = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export function apiFailure(e: unknown) {
  if (e instanceof ApiError) return privateJson({ error: e.message }, e.status);
  return privateJson({ error: "Request could not be completed" }, 500);
}

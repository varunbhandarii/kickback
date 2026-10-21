import "server-only";
import { cookies } from "next/headers";
import { getSession, memberMerchant, type Role } from "../dal";
import { getEnv } from "../env";
import { viewerKey } from "../demo/accounts";
import { allowRequest, clientIp } from "../rate-limit";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
type ActorOptions = {
  /** Let read-only demo visitors through (reads and the Analyst only). */
  allowViewer?: boolean;
  /** Per-session requests per minute for this route. */
  perMinute?: [name: string, limit: number];
};
export async function apiActor(req: Request, options: ActorOptions = {}) {
  const site = req.headers.get("sec-fetch-site");
  if (site && !["same-origin", "none"].includes(site))
    throw new ApiError(403, "Cross-site request rejected");
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(getEnv().APP_URL).origin)
    throw new ApiError(403, "Origin rejected");
  const session = await getSession();
  if (!session) throw new ApiError(401, "Sign in required");
  if (
    options.perMinute &&
    !allowRequest(
      `api:${options.perMinute[0]}:${session.session.id}`,
      options.perMinute[1],
    )
  )
    throw new ApiError(429, "Too many requests. Try again in a minute.");
  const selected = (await cookies()).get("kickback.merchant")?.value,
    roles: Role[] = options.allowViewer ? ["OWNER", "VIEWER"] : ["OWNER"];
  const found = await memberMerchant(session.user.id, selected, roles);
  const merchant = found?.merchant;
  if (!merchant || merchant.purgeAfter || merchant.status === "DISCONNECTED")
    throw new ApiError(403, "Business unavailable");
  const role = found.role;
  return {
    userId: session.user.id,
    merchantId: merchant.id,
    merchant,
    role,
    /** Demo visitors share one account, so their AI quota is keyed by network. */
    viewerKey:
      role === "VIEWER"
        ? viewerKey(clientIp(req), getEnv().BETTER_AUTH_SECRET ?? "")
        : undefined,
  };
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

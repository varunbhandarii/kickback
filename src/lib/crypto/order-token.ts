import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getEnv } from "../env";
const tokenPayload = z.object({ orderId: z.string().regex(/^[A-Z0-9]{10,32}$/), merchant: z.string().min(1).max(64), requestId: z.uuid(), expiresAt: z.number(),slug: z.string().regex(/^[a-z0-9-]{1,64}$/).optional(),wallet: z.enum(["paypal","venmo"]).optional(),amountCents: z.number().int().min(100).max(50000).optional() });
type Payload = z.infer<typeof tokenPayload>;
function signature(encoded: string) {
  return createHmac("sha256", Buffer.from(getEnv().KICKBACK_MASTER_KEY, "base64")).update(encoded).digest("base64url");
}
export function signOrderToken(payload: Omit<Payload, "expiresAt">) {
  const encoded = Buffer.from(JSON.stringify({ ...payload, expiresAt: Date.now() + 6 * 60 * 60 * 1000 })).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}
export function verifyOrderToken(token: string): Payload {
  const [encoded, sig, extra] = token.split(".");
  if (!encoded || !sig || extra !== undefined) throw new Error("Invalid order token");
  const expected = Buffer.from(signature(encoded));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error("Invalid order token");
  const parsed = tokenPayload.parse(JSON.parse(Buffer.from(encoded, "base64url").toString()));
  if (parsed.expiresAt < Date.now()) throw new Error("Expired order token");
  return parsed;
}

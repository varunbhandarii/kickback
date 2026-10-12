import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getEnv } from "../env";
import { merchantName } from "../paypal/merchants";
const tokenPayload = z.object({ orderId: z.string().regex(/^[A-Z0-9]{10,32}$/), merchant: merchantName, requestId: z.uuid(), expiresAt: z.number() });
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

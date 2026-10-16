import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { derive } from "./tenant";
const payload = z.strictObject({
  m: z.uuid(),
  c: z.string().min(8).max(80),
  iat: z.number().int().nonnegative(),
});
const sign = (encoded: string) =>
  createHmac("sha256", derive("progress-link/v1"))
    .update(encoded)
    .digest("base64url");
export function signProgressToken(
  merchantId: string,
  customerKey: string,
  now = Date.now(),
) {
  const encoded = Buffer.from(
    JSON.stringify({
      m: merchantId,
      c: customerKey,
      iat: Math.floor(now / 1000),
    }),
  ).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}
export function verifyProgressToken(
  token: string,
  now = Date.now(),
  ttlDays = 365,
) {
  if (token.length > 512) return null;
  const [encoded, mac, extra] = token.split(".");
  if (!encoded || !mac || extra) return null;
  const a = Buffer.from(sign(encoded)),
    b = Buffer.from(mac);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = payload.parse(
      JSON.parse(Buffer.from(encoded, "base64url").toString()),
    );
    return p.iat * 1000 <= now && p.iat * 1000 + ttlDays * 86400000 > now
      ? p
      : null;
  } catch {
    return null;
  }
}

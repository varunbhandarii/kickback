import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { getEnv } from "../env";
function derive(info: string) {
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(getEnv().KICKBACK_MASTER_KEY, "base64"),
      "kickback/v1",
      info,
      32,
    ),
  );
}
export function merchantKey(merchantId: string) {
  if (!merchantId.trim()) throw new Error("Merchant ID required");
  return derive(`merchant:${merchantId}`);
}
export function customerKey(merchantId: string, accountId: string) {
  if (!accountId.trim()) throw new Error("Account ID required");
  return createHmac("sha256", merchantKey(merchantId))
    .update(accountId)
    .digest()
    .subarray(0, 16)
    .toString("base64url");
}
export function encryptSecret(secret: string, merchantId?: string) {
  if (!secret) throw new Error("Secret required");
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", derive("connections"), iv);
  if (merchantId) cipher.setAAD(Buffer.from(merchantId));
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([
    Buffer.from([merchantId ? 2 : 1]),
    iv,
    cipher.getAuthTag(),
    encrypted,
  ]);
}
export function decryptSecret(value: Buffer, merchantId?: string) {
  if (value.length < 30 || ![1, 2].includes(value[0]))
    throw new Error("Invalid encrypted secret");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    derive("connections"),
    value.subarray(1, 13),
  );
  if (value[0] === 2) {
    if (!merchantId) throw new Error("Merchant binding required");
    cipher.setAAD(Buffer.from(merchantId));
  }
  cipher.setAuthTag(value.subarray(13, 29));
  return Buffer.concat([
    cipher.update(value.subarray(29)),
    cipher.final(),
  ]).toString("utf8");
}

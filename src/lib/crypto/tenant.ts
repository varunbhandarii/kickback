import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { getEnv } from "../env";
function derive(info: string) { return Buffer.from(hkdfSync("sha256", Buffer.from(getEnv().KICKBACK_MASTER_KEY, "base64"), "kickback/v1", info, 32)); }
export function merchantKey(merchantId: string) { if (!merchantId.trim()) throw new Error("Merchant ID required"); return derive(`merchant:${merchantId}`); }
export function customerKey(merchantId: string, accountId: string) { if (!accountId.trim()) throw new Error("Account ID required"); return createHmac("sha256", merchantKey(merchantId)).update(accountId).digest().subarray(0,16).toString("base64url"); }
export function encryptSecret(secret: string) {
  if (!secret) throw new Error("Secret required");
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", derive("connections"), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]);
}
export function decryptSecret(value: Buffer) {
  if (value.length < 30 || value[0] !== 1) throw new Error("Invalid encrypted secret");
  const cipher = createDecipheriv("aes-256-gcm", derive("connections"), value.subarray(1,13));
  cipher.setAuthTag(value.subarray(13,29));
  return Buffer.concat([cipher.update(value.subarray(29)), cipher.final()]).toString("utf8");
}

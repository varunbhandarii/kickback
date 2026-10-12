import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getEnv } from "../env";
const payloadSchema = z.object({ id: z.uuid(), expiresAt: z.number() });
function signature(value: string) { return createHmac("sha256",Buffer.from(getEnv().KICKBACK_MASTER_KEY,"base64")).update(`reward-status/v1:${value}`).digest("base64url"); }
export function signRewardToken(id: string) { const encoded = Buffer.from(JSON.stringify({ id,expiresAt: Date.now()+3600000 })).toString("base64url"); return `${encoded}.${signature(encoded)}`; }
export function verifyRewardToken(token: string,id: string) { const [encoded,mac,extra] = token.split("."); if (!encoded || !mac || extra) return false; const expected = Buffer.from(signature(encoded)), actual = Buffer.from(mac); if (expected.length !== actual.length || !timingSafeEqual(expected,actual)) return false; try { const data = payloadSchema.parse(JSON.parse(Buffer.from(encoded,"base64url").toString())); return data.id === id && data.expiresAt > Date.now(); } catch { return false; } }

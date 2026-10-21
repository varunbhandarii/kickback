import { createHash } from "node:crypto";
type Bucket = { tokens: number; at: number; seen: number; window: number };
const buckets = new Map<string,Bucket>();
export function clientIp(request: Request) { return request.headers.get("cf-connecting-ip") ?? request.headers.get("true-client-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"; }
/** Client IP from incoming headers (server actions and server components). */
export function headerIp(headers: Headers) { return headers.get("cf-connecting-ip") ?? headers.get("true-client-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"; }
/** Token bucket per key: `capacity` requests per minute. */
export function allowRequest(key: string, capacity: number, now = Date.now()) {
  return allowRequestPer(key, capacity, 60000, now);
}
/** Token bucket per key: `capacity` requests per `windowMs`, refilled evenly. */
export function allowRequestPer(key: string, capacity: number, windowMs: number, now = Date.now()) {
  const hashed = createHash("sha256").update(`${windowMs}:${key}`).digest("hex");
  const bucket = buckets.get(hashed) ?? { tokens: capacity, at: now, seen: now, window: windowMs };
  bucket.tokens = Math.min(capacity,bucket.tokens+(now-bucket.at)*capacity/windowMs); bucket.at = now; bucket.seen = now;
  const allowed = bucket.tokens >= 1; if (allowed) bucket.tokens--;
  buckets.set(hashed,bucket);
  if (buckets.size > 10000) for (const [id,row] of buckets) { if (row.seen < now-Math.max(120000,row.window) || buckets.size > 20000) buckets.delete(id); }
  return allowed;
}
export function limited() { return Response.json({ error: "Too many requests. Try again shortly." }, { status: 429, headers: { "Retry-After": "60" } }); }
export function resetRateLimits() { buckets.clear(); }

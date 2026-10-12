import { createHash } from "node:crypto";
type Bucket = { tokens: number; at: number; seen: number };
const buckets = new Map<string,Bucket>();
export function clientIp(request: Request) { return request.headers.get("cf-connecting-ip") ?? request.headers.get("true-client-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"; }
export function allowRequest(key: string, capacity: number, now = Date.now()) {
  const hashed = createHash("sha256").update(key).digest("hex");
  const bucket = buckets.get(hashed) ?? { tokens: capacity, at: now, seen: now };
  bucket.tokens = Math.min(capacity,bucket.tokens+(now-bucket.at)*capacity/60000); bucket.at = now; bucket.seen = now;
  const allowed = bucket.tokens >= 1; if (allowed) bucket.tokens--;
  buckets.set(hashed,bucket);
  if (buckets.size > 10000) for (const [id,row] of buckets) { if (row.seen < now-120000 || buckets.size > 20000) buckets.delete(id); }
  return allowed;
}
export function limited() { return Response.json({ error: "Too many requests. Try again shortly." }, { status: 429, headers: { "Retry-After": "60" } }); }
export function resetRateLimits() { buckets.clear(); }

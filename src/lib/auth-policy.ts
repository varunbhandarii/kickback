import { createHmac } from "node:crypto";
const buckets = new Map<string, { attempts: number; until: number }>();
const emailBucketKey = (email: string, secret: string) =>
  createHmac("sha256", secret).update(email.trim().toLowerCase()).digest("hex");
export const MAX_SESSION_AGE_MS = 30 * 86400000;
export function sessionTooOld(createdAt: Date, now = Date.now()) {
  return now - createdAt.getTime() >= MAX_SESSION_AGE_MS;
}
export function emailAttemptAllowed(
  email: string,
  secret: string,
  now = Date.now(),
) {
  const key = emailBucketKey(email, secret);
  if (buckets.size >= 10000)
    for (const [id, bucket] of buckets)
      if (bucket.until <= now) buckets.delete(id);
  const previous = buckets.get(key);
  if (previous && previous.until > now) {
    if (previous.attempts >= 5) return false;
    previous.attempts++;
    return true;
  }
  if (buckets.size >= 10000) return false;
  buckets.set(key, { attempts: 1, until: now + 15 * 60000 });
  return true;
}
export function clearEmailAttempts(email: string, secret: string) {
  buckets.delete(emailBucketKey(email, secret));
}
export function resetEmailBucketsForTests() {
  if (process.env.NODE_ENV !== "test") throw new Error("Test-only reset");
  buckets.clear();
}

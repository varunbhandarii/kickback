import { createHmac } from "node:crypto";
/** Shared demo identities. Their credentials stay server-side. */
export const DEMO_OWNER_EMAIL = "demo@kickback.local";
export const DEMO_VIEWER_EMAIL = "viewer@kickback.local";
export const DEMO_EMAILS = [DEMO_OWNER_EMAIL, DEMO_VIEWER_EMAIL];
/** Read-only demo sessions end after a day; owners keep the normal 30 days. */
export const VIEWER_SESSION_MS = 24 * 3600000;
export const isDemoEmail = (email: string | null | undefined) =>
  Boolean(email && DEMO_EMAILS.includes(email.trim().toLowerCase()));
/** Proof that a viewer sign-in comes from the demo page's server action. */
export const DEMO_SIGN_IN_HEADER = "x-kickback-demo-sign-in";
export const demoSignInToken = (secret: string) =>
  createHmac("sha256", secret).update("demo-viewer-sign-in").digest("hex");
/** Stable, non-reversible key for a visitor's network (quotas and demo runs). */
export const viewerKey = (ip: string, secret: string) =>
  createHmac("sha256", secret)
    .update("demo-visitor:" + ip)
    .digest("hex")
    .slice(0, 32);
/** Better Auth endpoints that change or end a shared demo account. */
export const DEMO_LOCKED_AUTH_PATHS = [
  "/change-password",
  "/change-email",
  "/update-user",
  "/delete-user",
  "/set-password",
  "/revoke-sessions",
  "/revoke-other-sessions",
  "/revoke-session",
  "/link-social",
  "/unlink-account",
];
/** Browser cookie holding a pay-path reservation (a random id, nothing else). */
export const DEMO_COOKIE = "kb_demo";

import { z } from "zod";

const blankOptional = (schema: z.ZodType = z.string()) => z.preprocess((v) => v === "" ? undefined : v, schema.optional());
const flag = z.enum(["true", "false"]).default("false").transform((v) => v === "true");
export const envSchema = z.object({
  KICKBACK_ENV: z.enum(["sandbox", "live"]).default("sandbox"),
  DATABASE_URL: z.url(),
  APP_URL: z.url().default("http://localhost:3000"),
  PAYPAL_CLIENT_ID: z.string().min(1),
  PAYPAL_CLIENT_SECRET: z.string().min(1),
  PAYPAL_PARTNER_ID: blankOptional(z.string().regex(/^[A-Z0-9]{13}$/)),
  PAYPAL_BN_CODE: blankOptional(),
  PAYPAL_WEBHOOK_ID: blankOptional(),
  ANTHROPIC_API_KEY: blankOptional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  KICKBACK_MASTER_KEY: z.string().refine((v) => /^[A-Za-z0-9+/]{43}=$/.test(v) && Buffer.from(v, "base64").length === 32, "Must be 32 random bytes encoded as Base64"),
  JOBS_BEARER: z.string().min(32),
  DEMO_MODE: flag,
  KICKBACK_ALLOW_UNVERIFIED_WEBHOOKS: flag,
  PAYPAL_CONNECTION_MODE: z.enum(["partner", "byo"]).default("partner"),
}).superRefine((env, ctx) => {
  if (env.KICKBACK_ENV === "live" && (env.KICKBACK_ALLOW_UNVERIFIED_WEBHOOKS || env.DEMO_MODE)) {
    ctx.addIssue({ code: "custom", message: "Sandbox tools and signature bypass are forbidden in live mode" });
  }
  if (env.APP_URL.startsWith("http:") && env.KICKBACK_ENV === "live") {
    ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "Live mode requires HTTPS" });
  }
});

export function getEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    // Do not include input values in configuration errors.
    throw new Error(`Invalid environment: ${result.error.issues.map((i) => `${i.path.join(".") || "configuration"}: ${i.message}`).join("; ")}`);
  }
  return result.data;
}

export function sandboxToolsEnabled() {
  return process.env.KICKBACK_ENV === "sandbox" && process.env.DEMO_MODE === "true";
}

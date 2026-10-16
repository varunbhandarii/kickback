import { z } from "zod";

const blankOptional = (schema: z.ZodType<string> = z.string()) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());
const flag = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");
export const envSchema = z
  .object({
    KICKBACK_ENV: z.enum(["sandbox", "live"]).default("sandbox"),
    DATABASE_URL: z.url(),
    APP_URL: z.url().default("http://localhost:3000"),
    PROGRESS_LINK_TTL_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(365)
      .default(365),
    SENTRY_CSP_REPORT_URL: blankOptional(z.url()),
    RENDER_API_KEY: blankOptional(),
    WORKFLOW_SLUG: blankOptional(),
    PAYPAL_CLIENT_ID: z.string().min(1),
    PAYPAL_CLIENT_SECRET: z.string().min(1),
    PAYPAL_PARTNER_ID: blankOptional(z.string().regex(/^[A-Z0-9]{13}$/)),
    PAYPAL_BN_CODE: blankOptional(),
    PAYPAL_WEBHOOK_ID: blankOptional(),
    ANTHROPIC_API_KEY: blankOptional(),
    ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
    AI_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    AI_EFFORT_DESIGNER: z.enum(["low", "medium", "high"]).default("high"),
    AI_EFFORT_ANALYST: z.enum(["low", "medium", "high"]).default("low"),
    AI_MAX_ANALYST_TURNS_PER_MERCHANT_PER_DAY: z.coerce
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(80),
    AI_MAX_CALLS_PER_MERCHANT_PER_DAY: z.coerce
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(30),
    KICKBACK_MASTER_KEY: z
      .string()
      .refine(
        (v) =>
          /^[A-Za-z0-9+/]{43}=$/.test(v) &&
          Buffer.from(v, "base64").length === 32,
        "Must be 32 random bytes encoded as Base64",
      ),
    JOBS_BEARER: z.string().min(32),
    DEMO_MODE: flag,
    KICKBACK_ALLOW_UNVERIFIED_WEBHOOKS: flag,
    PAYPAL_CONNECTION_MODE: z.enum(["partner", "byo"]).default("partner"),
    PG_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
    PAYPAL_RATE_PER_MIN: z.coerce.number().int().min(1).max(40).default(40),
    KICKBACK_PAUSE_REWARDS: flag,
    REWARD_SETTLE_IMMEDIATE: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    BETTER_AUTH_SECRET: blankOptional(z.string().min(32)),
    BETTER_AUTH_URL: blankOptional(z.url()),
    DEMO_USER_PASSWORD: blankOptional(z.string().min(10)),
    PAYPAL_LOGIN_ENABLED: flag,
    RESEND_API_KEY: blankOptional(),
    EMAIL_FROM: blankOptional(),
    TENANT_PURGE_HOURS: z.coerce.number().min(0.01).max(48).default(48),
    RECONCILE_INTERVAL_HOURS: z.coerce.number().min(0.01).max(24).default(6),
    BACKFILL_DAYS: z.coerce.number().int().min(1).max(90).default(90),
  })
  .superRefine((env, ctx) => {
    if (
      env.KICKBACK_ENV === "live" &&
      (env.KICKBACK_ALLOW_UNVERIFIED_WEBHOOKS || env.DEMO_MODE)
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Sandbox tools and signature bypass are forbidden in live mode",
      });
    }
    if (env.APP_URL.startsWith("http:") && env.KICKBACK_ENV === "live") {
      ctx.addIssue({
        code: "custom",
        path: ["APP_URL"],
        message: "Live mode requires HTTPS",
      });
    }
    if (env.KICKBACK_ENV === "live" && env.TENANT_PURGE_HOURS < 48)
      ctx.addIssue({
        code: "custom",
        message: "Shortened tenant purge is sandbox-only",
      });
  });

export function getEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    // Do not include input values in configuration errors.
    throw new Error(
      `Invalid environment: ${result.error.issues.map((i) => `${i.path.join(".") || "configuration"}: ${i.message}`).join("; ")}`,
    );
  }
  return result.data;
}

export function sandboxToolsEnabled() {
  return (
    process.env.KICKBACK_ENV === "sandbox" && process.env.DEMO_MODE === "true"
  );
}

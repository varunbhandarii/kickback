import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { magicLink } from "better-auth/plugins";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { getEnv } from "./env";
import { clearEmailAttempts, emailAttemptAllowed } from "./auth-policy";
import { emailConfigured, sendMerchantEmail } from "./email";
export function createMerchantAuth(database = getDb(), env = getEnv()) {
  if (!env.BETTER_AUTH_SECRET)
    throw new Error("Set BETTER_AUTH_SECRET using npm run env:init");
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL ?? env.APP_URL,
    database: drizzleAdapter(database, { provider: "pg", schema }),
    trustedOrigins: [env.APP_URL],
    logger: { disabled: true },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      ...(emailConfigured()
        ? {
            sendResetPassword: async ({
              user,
              url,
            }: {
              user: { email: string };
              url: string;
            }) => {
              await sendMerchantEmail(
                user.email,
                "Reset your Kickback password",
                `Reset your password: ${url}`,
              ).catch(() =>
                console.error(
                  JSON.stringify({ action: "merchant_email_delivery_failed" }),
                ),
              );
            },
          }
        : {}),
    },
    session: {
      expiresIn: 7 * 86400,
      updateAge: 86400,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
      },
    },
    socialProviders: env.PAYPAL_LOGIN_ENABLED
      ? {
          paypal: {
            clientId: env.PAYPAL_CLIENT_ID,
            clientSecret: env.PAYPAL_CLIENT_SECRET,
            environment: env.KICKBACK_ENV,
            // This provider version supplies no default authorization scopes.
            authorizationEndpoint:
              env.KICKBACK_ENV === "sandbox"
                ? "https://www.sandbox.paypal.com/signin/authorize?scope=openid%20profile%20email"
                : "https://www.paypal.com/signin/authorize?scope=openid%20profile%20email",
          },
        }
      : {},
    account: { encryptOAuthTokens: true },
    emailVerification: {
      sendOnSignUp: emailConfigured(),
      autoSignInAfterVerification: true,
      expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) => {
        if (!emailConfigured()) throw new Error("Email unavailable");
        await sendMerchantEmail(
          user.email,
          "Verify your Kickback email",
          `Verify your merchant account email: ${url}`,
        );
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const origin = ctx.headers?.get("origin");
        if (origin && origin !== new URL(env.APP_URL).origin)
          throw new APIError("FORBIDDEN", { message: "Untrusted origin" });
        if (
          ["/sign-in/magic-link", "/send-verification-email"].includes(
            ctx.path,
          ) &&
          !emailConfigured()
        )
          throw new APIError("SERVICE_UNAVAILABLE", {
            message: "Email is unavailable",
          });
        if (
          ctx.path === "/sign-in/email" &&
          typeof ctx.body?.email === "string" &&
          !emailAttemptAllowed(ctx.body.email, env.BETTER_AUTH_SECRET!)
        )
          throw new APIError("TOO_MANY_REQUESTS", {
            message: "Unable to sign in. Try again later.",
          });
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-in/email" && ctx.context.newSession)
          clearEmailAttempts(
            ctx.context.newSession.user.email,
            env.BETTER_AUTH_SECRET!,
          );
      }),
    },
    plugins: [
      magicLink({
        expiresIn: 600,
        disableSignUp: true,
        storeToken: "hashed",
        rateLimit: { window: 60, max: 3 },
        sendMagicLink: async ({ email, url }) => {
          await sendMerchantEmail(
            email,
            "Your Kickback sign-in link",
            `Sign in within 10 minutes using this single-use link: ${url}`,
          );
        },
      }),
      nextCookies(),
    ],
  });
}
export const auth = createMerchantAuth();

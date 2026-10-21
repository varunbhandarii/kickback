"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { emailConfigured } from "@/lib/email";
import { allowRequestPer, headerIp } from "@/lib/rate-limit";
export type AuthState = { error?: string; message?: string };
const MINUTE = 60000;
/** Per-IP limits for the account forms (server actions bypass Better Auth's HTTP limiter). */
async function ipAllowed(action: string, rules: [number, number][]) {
  const ip = headerIp(await headers());
  return rules.every(([capacity, windowMs]) =>
    allowRequestPer(`auth:${action}:${ip}`, capacity, windowMs),
  );
}
const busy = {
  error: "Too many attempts from this network. Wait a few minutes and try again.",
};
const email = z
  .email()
  .max(254)
  .transform((value) => value.trim().toLowerCase());
export async function signIn(
  _state: AuthState,
  form: FormData,
): Promise<AuthState> {
  const input = z
    .object({ email, password: z.string().min(1).max(128) })
    .safeParse(Object.fromEntries(form));
  if (!input.success) return { error: "Invalid email or password." };
  if (!(await ipAllowed("sign-in", [[10, 10 * MINUTE]]))) return busy;
  try {
    await auth.api.signInEmail({ body: input.data, headers: await headers() });
  } catch {
    return {
      error:
        "Invalid email or password. If you have tried several times, wait 15 minutes.",
    };
  }
  redirect("/m");
}
export async function signUp(
  _state: AuthState,
  form: FormData,
): Promise<AuthState> {
  const input = z
    .object({
      name: z.string().trim().min(1).max(80),
      email,
      password: z.string().min(10).max(128),
    })
    .safeParse(Object.fromEntries(form));
  if (!input.success)
    return {
      error:
        "Enter your name, a valid email, and a password of at least 10 characters.",
    };
  if (!(await ipAllowed("sign-up", [[5, 10 * MINUTE], [30, 1440 * MINUTE]])))
    return busy;
  try {
    await auth.api.signUpEmail({ body: input.data, headers: await headers() });
  } catch {
    return {
      error: "Unable to create an account. Try signing in or try again later.",
    };
  }
  redirect("/m/onboarding/business");
}
export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/sign-in");
}
export async function requestReset(
  _state: AuthState,
  form: FormData,
): Promise<AuthState> {
  if (!emailConfigured())
    return { error: "Password reset email is temporarily unavailable." };
  if (!(await ipAllowed("reset", [[3, 10 * MINUTE]]))) return busy;
  const parsed = email.safeParse(form.get("email"));
  if (parsed.success)
    try {
      await auth.api.requestPasswordReset({
        body: { email: parsed.data, redirectTo: "/reset-password" },
        headers: await headers(),
      });
    } catch {
      /* Keep the response generic. */
    }
  return {
    message:
      "If that account exists, a password reset link will arrive shortly.",
  };
}
export async function requestMagicLink(
  _state: AuthState,
  form: FormData,
): Promise<AuthState> {
  if (!emailConfigured())
    return { error: "Sign-in email is temporarily unavailable." };
  if (!(await ipAllowed("magic", [[3, 10 * MINUTE]]))) return busy;
  const parsed = email.safeParse(form.get("email"));
  if (parsed.success)
    try {
      await auth.api.signInMagicLink({
        body: { email: parsed.data, callbackURL: "/m" },
        headers: await headers(),
      });
    } catch {}
  return {
    message:
      "If that account exists, a single-use sign-in link will arrive shortly. It expires in 10 minutes.",
  };
}
export async function requestVerification(
  _state: AuthState,
): Promise<AuthState> {
  void _state;
  if (!emailConfigured())
    return { error: "Verification email is temporarily unavailable." };
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  try {
    await auth.api.sendVerificationEmail({
      body: { email: session.user.email, callbackURL: "/verify-email" },
      headers: await headers(),
    });
  } catch {}
  return { message: "If verification is needed, a link will arrive shortly." };
}
export async function resetPassword(
  _state: AuthState,
  form: FormData,
): Promise<AuthState> {
  const input = z
    .object({
      token: z.string().min(1).max(1000),
      password: z.string().min(10).max(128),
    })
    .safeParse(Object.fromEntries(form));
  if (!input.success)
    return {
      error: "Use a valid reset link and a password of at least 10 characters.",
    };
  try {
    await auth.api.resetPassword({
      body: { token: input.data.token, newPassword: input.data.password },
      headers: await headers(),
    });
  } catch {
    return { error: "This reset link is invalid or expired." };
  }
  redirect("/sign-in?reset=done");
}

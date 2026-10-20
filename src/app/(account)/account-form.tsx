"use client";
import Link from "next/link";
import { useActionState, useId } from "react";
import { authClient } from "@/lib/auth-client";
import {
  signIn,
  signUp,
  requestReset,
  requestMagicLink,
  resetPassword,
  type AuthState,
} from "./actions";
export default function AccountForm({
  mode,
  paypal = false,
  token = "",
  emailEnabled = true,
}: {
  mode: "sign-in" | "sign-up" | "forgot" | "reset" | "magic";
  paypal?: boolean;
  token?: string;
  emailEnabled?: boolean;
}) {
  const action =
    mode === "sign-in"
      ? signIn
      : mode === "sign-up"
        ? signUp
        : mode === "forgot"
          ? requestReset
          : mode === "magic"
            ? requestMagicLink
            : resetPassword;
  const [state, submit, pending] = useActionState<AuthState, FormData>(
    action,
    {},
  );
  const id = useId();
  const emailOnly = mode === "forgot" || mode === "magic";
  return (
    <div className="flex flex-col gap-5">
      <form action={submit} className="form-stack">
        {mode === "sign-up" && (
          <label className="field">
            <span className="field-label">Your name</span>
            <input className="input" name="name" autoComplete="name" maxLength={80} required />
          </label>
        )}
        {mode !== "reset" && (
          <label className="field">
            <span className="field-label">Email</span>
            <input
              className="input"
              type="email"
              name="email"
              autoComplete="email"
              maxLength={254}
              required
            />
          </label>
        )}
        {!emailOnly && (
          <div className="field">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor={`${id}-password`} className="field-label">
                {mode === "reset" ? "New password" : "Password"}
              </label>
              {mode === "sign-in" && (
                <Link href="/forgot-password" style={{ fontSize: 13.5, fontWeight: 600 }}>
                  Forgot password?
                </Link>
              )}
            </div>
            <input
              id={`${id}-password`}
              className="input"
              type="password"
              name="password"
              autoComplete={
                mode === "sign-in" ? "current-password" : "new-password"
              }
              minLength={mode === "sign-in" ? 1 : 10}
              maxLength={128}
              required
              aria-describedby={mode === "sign-in" ? undefined : `${id}-password-help`}
            />
            {mode !== "sign-in" && (
              <span id={`${id}-password-help`} className="field-help">
                At least 10 characters.
              </span>
            )}
          </div>
        )}
        {mode === "reset" && <input type="hidden" name="token" value={token} />}
        {state.error && (
          <p role="alert" className="alert">
            {state.error}
          </p>
        )}
        {state.message && (
          <p role="status" className="banner banner-success">
            {state.message}
          </p>
        )}
        <button
          type="submit"
          className="btn btn-primary btn-lg btn-block"
          disabled={pending || (emailOnly && !emailEnabled)}
          aria-busy={pending || undefined}
        >
          {pending && <span className="spinner" aria-hidden="true" />}
          {pending
            ? "Please wait…"
            : mode === "sign-in"
              ? "Sign in"
              : mode === "sign-up"
                ? "Create account"
                : mode === "forgot"
                  ? "Send reset link"
                  : mode === "magic"
                    ? "Email me a sign-in link"
                    : "Save password"}
        </button>
        {emailOnly && !emailEnabled && (
          <p className="banner banner-info">
            {mode === "magic"
              ? "Email sign-in isn't available right now. Use your password instead."
              : "Password reset email isn't available right now."}
          </p>
        )}
      </form>
      {paypal && (
        <>
          <p className="or-divider">or</p>
          <button
            type="button"
            className="btn btn-secondary btn-lg btn-block"
            onClick={() => {
              void authClient.signIn.social({
                provider: "paypal",
                callbackURL: "/m",
                errorCallbackURL: "/sign-in",
              });
            }}
          >
            Continue with PayPal
          </button>
        </>
      )}
    </div>
  );
}

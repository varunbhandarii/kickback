"use client";
import { useActionState } from "react";
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
  return (
    <>
      <form action={submit} className="merchant-form">
        {mode === "sign-up" && (
          <label>
            Your name
            <input name="name" autoComplete="name" maxLength={80} required />
          </label>
        )}
        {mode !== "reset" && (
          <label>
            Email
            <input
              type="email"
              name="email"
              autoComplete="email"
              maxLength={254}
              required
            />
          </label>
        )}
        {!["forgot", "magic"].includes(mode) && (
          <label>
            Password
            <input
              type="password"
              name="password"
              autoComplete={
                mode === "sign-in" ? "current-password" : "new-password"
              }
              minLength={mode === "sign-in" ? 1 : 10}
              maxLength={128}
              required
            />
          </label>
        )}
        {mode === "reset" && <input type="hidden" name="token" value={token} />}
        {state.error && (
          <p role="alert" className="merchant-error">
            {state.error}
          </p>
        )}
        {state.message && <p role="status">{state.message}</p>}
        <button
          className="merchant-primary"
          disabled={
            pending || (["forgot", "magic"].includes(mode) && !emailEnabled)
          }
        >
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
        {["forgot", "magic"].includes(mode) && !emailEnabled && (
          <p>Authentication email is temporarily unavailable.</p>
        )}
      </form>
      {paypal && (
        <button
          className="merchant-secondary"
          onClick={() => {
            void authClient.signIn.social({
              provider: "paypal",
              callbackURL: "/m",
              errorCallbackURL: "/sign-in",
            });
          }}
        >
          Log in with PayPal
        </button>
      )}
    </>
  );
}

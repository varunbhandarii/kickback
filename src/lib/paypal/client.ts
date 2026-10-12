import { randomUUID } from "node:crypto";
import { getEnv } from "../env";
import { authAssertion } from "./auth";
import { paceRequest, type Priority } from "./pacing";
export { paceRequest } from "./pacing";

type ErrorBody = { name?: string; message?: string; debug_id?: string; details?: { issue?: string; description?: string; field?: string }[] };
export class PayPalApiError extends Error {
  readonly name: string;
  readonly debug_id?: string;
  readonly details: NonNullable<ErrorBody["details"]>;
  constructor(readonly status: number, body: ErrorBody) {
    super(body.message ?? `PayPal request failed (${status})`);
    this.name = body.name ?? "PAYPAL_API_ERROR";
    this.debug_id = body.debug_id;
    this.details = body.details ?? [];
  }
  toJSON() { return { status: this.status, name: this.name, debug_id: this.debug_id, details: this.details.map(({ issue }) => ({ issue })) }; }
}

export type PayPalOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  merchantId?: string;
  requestId?: string;
  mockCode?: string;
  priority?: Priority;
  deadline?: number;
};
type Config = { clientId: string; clientSecret: string; environment: "sandbox" | "live"; bnCode?: string; retries?: number };
type Dependencies = { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number; pace?: (priority?: Priority, deadline?: number) => Promise<void> };
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createPayPalClient(config: Config, deps: Dependencies = {}) {
  const fetcher = deps.fetch ?? fetch;
  const wait = deps.sleep ?? sleep;
  const now = deps.now ?? Date.now;
  const pace = deps.pace ?? paceRequest;
  const base = config.environment === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
  let token: { access_token: string; expiresAt: number; scope?: string } | undefined;
  let tokenPromise: Promise<NonNullable<typeof token>> | undefined;

  async function send(path: string, init: RequestInit, priority: Priority = "normal", deadline?: number) {
    for (let attempt = 0; ; attempt++) {
      if (deadline && now() >= deadline) throw new Error("PayPal request deadline reached");
      await pace(priority,deadline);
      if (deadline && now() >= deadline) throw new Error("PayPal request deadline reached");
      let response: Response;
      try { response = await fetcher(`${base}${path}`, { ...init, signal: AbortSignal.timeout(Math.max(1,Math.min(15000,deadline ? deadline-now() : 15000))), cache: "no-store" }); }
      catch (error) {
        if (attempt >= (config.retries ?? 3)) throw error;
        await wait(Math.min(500 * 2 ** attempt,deadline ? Math.max(0,deadline-now()) : 4000));
        continue;
      }
      if ((response.status === 409 || response.status === 429 || response.status >= 500) && attempt < (config.retries ?? 3)) {
        const retryAfter = response.headers.get("retry-after");
        const seconds = retryAfter === null ? NaN : Number(retryAfter);
        const delay = Number.isFinite(seconds) ? seconds * 1000 : retryAfter ? Date.parse(retryAfter) - now() : 0;
        await response.arrayBuffer();
        await wait(Math.min(deadline ? Math.max(0,deadline-now()) : 300000, Math.max(500 * 2 ** attempt, Number.isFinite(delay) ? delay : 0)));
        continue;
      }
      const raw = await response.text();
      let body: unknown;
      try { body = raw ? JSON.parse(raw) : undefined; }
      catch { throw new PayPalApiError(response.status, { name: "INVALID_RESPONSE" }); }
      if (!response.ok) throw new PayPalApiError(response.status, (body ?? {}) as ErrorBody);
      return body;
    }
  }

  async function accessToken(priority: Priority = "high", deadline?: number) {
    if (token && token.expiresAt > now()) return token;
    tokenPromise ??= (async () => {
      const body = await send("/v1/oauth2/token", {
        method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      }, priority, deadline) as { access_token: string; expires_in: number; scope?: string };
      if (!body.access_token || !Number.isFinite(body.expires_in)) throw new Error("Invalid PayPal OAuth response");
      token = { access_token: body.access_token, expiresAt: now() + Math.max(0, body.expires_in - 60) * 1000, scope: body.scope };
      return token;
    })();
    try { return await tokenPromise; } finally { tokenPromise = undefined; }
  }

  async function request<T = unknown>(path: string, options: PayPalOptions = {}): Promise<T> {
    if (!path.startsWith("/v") || path.includes("://") || path.startsWith("//")) throw new Error("Expected a PayPal API path");
    if (options.mockCode && config.environment !== "sandbox") throw new Error("Mock responses are sandbox-only");
    const method = options.method ?? "GET";
    const requestId = options.requestId ?? (method === "GET" ? undefined : randomUUID());
    const headers: Record<string, string> = {
      Authorization: `Bearer ${(await accessToken(options.priority,options.deadline)).access_token}`,
      "Content-Type": "application/json", Prefer: "return=representation",
    };
    const multipart = options.body instanceof FormData;
    if (multipart) delete headers["Content-Type"];
    if (config.bnCode) headers["PayPal-Partner-Attribution-Id"] = config.bnCode;
    if (options.merchantId) headers["PayPal-Auth-Assertion"] = authAssertion(config.clientId, options.merchantId);
    if (requestId) headers["PayPal-Request-Id"] = requestId;
    if (options.mockCode) headers["PayPal-Mock-Response"] = JSON.stringify({ mock_application_codes: options.mockCode });
    return await send(path, { method, headers, body: multipart ? options.body as FormData : options.body === undefined ? undefined : JSON.stringify(options.body) }, options.priority, options.deadline) as T;
  }
  return { request, accessToken };
}

let platformClient: ReturnType<typeof createPayPalClient> | undefined;
export function getPayPalClient() {
  const env = getEnv();
  platformClient ??= createPayPalClient({ clientId: env.PAYPAL_CLIENT_ID, clientSecret: env.PAYPAL_CLIENT_SECRET, environment: env.KICKBACK_ENV, bnCode: env.PAYPAL_BN_CODE as string | undefined });
  return platformClient;
}
export async function paypalFetch<T = unknown>(path: string, options?: PayPalOptions) {
  return getPayPalClient().request<T>(path, options);
}

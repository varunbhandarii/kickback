import { randomUUID } from "node:crypto";
import { getEnv } from "../env";
import { authAssertion } from "./auth";

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
};
type Config = { clientId: string; clientSecret: string; environment: "sandbox" | "live"; bnCode?: string; retries?: number };
type Dependencies = { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number; pace?: () => Promise<void> };
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
let nextRequestAt = 0;
let pacingQueue = Promise.resolve();
export function paceRequest() {
  const task = pacingQueue.then(async () => {
    await sleep(Math.max(0, nextRequestAt - Date.now()));
    nextRequestAt = Date.now() + 1500;
  });
  pacingQueue = task.catch(() => {});
  return task;
}

export function createPayPalClient(config: Config, deps: Dependencies = {}) {
  const fetcher = deps.fetch ?? fetch;
  const wait = deps.sleep ?? sleep;
  const now = deps.now ?? Date.now;
  const pace = deps.pace ?? paceRequest;
  const base = config.environment === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
  let token: { access_token: string; expiresAt: number; scope?: string } | undefined;
  let tokenPromise: Promise<NonNullable<typeof token>> | undefined;

  async function send(path: string, init: RequestInit) {
    for (let attempt = 0; ; attempt++) {
      await pace();
      let response: Response;
      try { response = await fetcher(`${base}${path}`, { ...init, signal: AbortSignal.timeout(15000), cache: "no-store" }); }
      catch (error) {
        if (attempt >= (config.retries ?? 3)) throw error;
        await wait(500 * 2 ** attempt);
        continue;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < (config.retries ?? 3)) {
        const retryAfter = response.headers.get("retry-after");
        const seconds = retryAfter === null ? NaN : Number(retryAfter);
        const delay = Number.isFinite(seconds) ? seconds * 1000 : retryAfter ? Date.parse(retryAfter) - now() : 0;
        await response.arrayBuffer();
        await wait(Math.min(300000, Math.max(500 * 2 ** attempt, Number.isFinite(delay) ? delay : 0)));
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

  async function accessToken() {
    if (token && token.expiresAt > now()) return token;
    tokenPromise ??= (async () => {
      const body = await send("/v1/oauth2/token", {
        method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      }) as { access_token: string; expires_in: number; scope?: string };
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
      Authorization: `Bearer ${(await accessToken()).access_token}`,
      "Content-Type": "application/json", Prefer: "return=representation",
    };
    if (config.bnCode) headers["PayPal-Partner-Attribution-Id"] = config.bnCode;
    if (options.merchantId) headers["PayPal-Auth-Assertion"] = authAssertion(config.clientId, options.merchantId);
    if (requestId) headers["PayPal-Request-Id"] = requestId;
    if (options.mockCode) headers["PayPal-Mock-Response"] = JSON.stringify({ mock_application_codes: options.mockCode });
    return await send(path, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) }) as T;
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

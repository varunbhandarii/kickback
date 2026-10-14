import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Tx } from "@/db";
import {
  captures,
  connections,
  merchants,
  merchantUsers,
  settings,
} from "@/db/schema";
import {
  createPayPalClient,
  getPayPalClient,
  PayPalApiError,
} from "./paypal/client";
import { createReferral } from "./paypal/referrals";
import { webhookEventTypes } from "./paypal/events";
import { encryptSecret } from "./crypto/tenant";
import { lockMerchant } from "./ledger/locks";
import { audit } from "./audit";
import { getEnv } from "./env";
export const PAYMENT_SCOPE =
    "https://uri.paypal.com/services/payments/payment/authcapture",
  REFUND_SCOPE = "https://uri.paypal.com/services/payments/refund",
  SEARCH_SCOPE = "https://uri.paypal.com/services/reporting/search/read";
export type Integration = {
  merchant_id?: string;
  tracking_id?: string;
  payments_receivable?: boolean;
  primary_email_confirmed?: boolean;
  oauth_integrations?: {
    status?: string;
    oauth_third_party?: { partner_client_id?: string; scopes?: string[] }[];
  }[];
};
export function connectionDecision(integration: Integration, clientId: string) {
  const scopes = [
    ...new Set(
      integration.oauth_integrations
        ?.filter((item) => !item.status || item.status === "A")
        .flatMap(
          (item) =>
            item.oauth_third_party
              ?.filter((row) => row.partner_client_id === clientId)
              .flatMap((row) => row.scopes ?? []) ?? [],
        ) ?? [],
    ),
  ];
  const connected =
    integration.payments_receivable === true &&
    integration.primary_email_confirmed === true &&
    [PAYMENT_SCOPE, REFUND_SCOPE].every((scope) => scopes.includes(scope));
  return {
    status: connected ? "CONNECTED" : "PENDING",
    scopes,
    paymentsReceivable: integration.payments_receivable === true,
    primaryEmailConfirmed: integration.primary_email_confirmed === true,
    searchEnabled: scopes.includes(SEARCH_SCOPE),
  };
}
export async function assertConnectionOwner(
  tx: Tx,
  userId: string,
  merchantId: string,
) {
  const [owner] = await tx
    .select()
    .from(merchantUsers)
    .where(
      and(
        eq(merchantUsers.userId, userId),
        eq(merchantUsers.merchantId, merchantId),
        eq(merchantUsers.role, "OWNER"),
      ),
    );
  if (!owner) throw new Error("Business access denied");
}
const attemptKey = (id: string) => `connection:${id}:attempt`;
async function beginAttempt(userId: string, merchantId: string, ip: string) {
  const token = randomUUID();
  await getDb().transaction(async (tx) => {
    await assertConnectionOwner(tx, userId, merchantId);
    await lockMerchant(tx, merchantId);
    await tx
      .insert(settings)
      .values({ key: attemptKey(merchantId), value: { token } })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: { token }, updatedAt: new Date() },
      });
    await audit(tx, merchantId, "merchant.consent", merchantId, {
      version: "2026-10",
      ip: ip.slice(0, 64),
      readHistoryDays: 90,
      operationalEmails: true,
    });
  });
  return token;
}
async function checkAttempt(tx: Tx, merchantId: string, token: string) {
  const [attempt] = await tx
    .select()
    .from(settings)
    .where(eq(settings.key, attemptKey(merchantId)));
  if ((attempt?.value as { token?: string } | undefined)?.token !== token)
    throw new Error("Connection request was cancelled; start again");
}
async function claimAccount(tx: Tx, merchantId: string, paypalId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`paypal-account:${paypalId}`}))`,
  );
  const claimed = await tx
    .select({ id: connections.merchantId })
    .from(connections)
    .innerJoin(
      merchantUsers,
      eq(merchantUsers.merchantId, connections.merchantId),
    )
    .where(
      and(
        eq(connections.merchantIdInPayPal, paypalId),
        eq(connections.status, "CONNECTED"),
        ne(connections.merchantId, merchantId),
      ),
    )
    .limit(1);
  if (claimed.length)
    throw new Error(
      "This PayPal account is already connected to another business",
    );
  const [previous] = await tx
    .select()
    .from(connections)
    .where(eq(connections.merchantId, merchantId));
  if (
    previous?.merchantIdInPayPal &&
    previous.merchantIdInPayPal !== paypalId
  ) {
    const existing = await tx
      .select({ id: captures.id })
      .from(captures)
      .where(eq(captures.merchantId, merchantId))
      .limit(1);
    if (existing.length)
      throw new Error("Use a new business for a different PayPal account");
  }
}
function integrationRows(result: unknown): Integration[] {
  if (Array.isArray(result)) return result as Integration[];
  if (!result || typeof result !== "object") return [];
  const data = result as Integration & {
    merchant_integrations?: Integration[];
    items?: Integration[];
  };
  return (
    data.merchant_integrations ?? data.items ?? (data.merchant_id ? [data] : [])
  );
}
export async function refreshPartnerConnection(
  merchantId: string,
  hint?: string,
  client = getPayPalClient(),
  deadline = Date.now() + 20000,
) {
  const [connection] = await getDb()
    .select()
    .from(connections)
    .where(eq(connections.merchantId, merchantId));
  if (
    !connection ||
    connection.mode !== "PARTNER" ||
    ["DISCONNECTED", "REVOKED"].includes(connection.status)
  )
    return connection;
  const env = getEnv();
  if (!env.PAYPAL_PARTNER_ID)
    throw new Error("Partner onboarding is unavailable");
  let integration: Integration | undefined;
  if (connection.trackingId) {
    try {
      const result = await client.request(
        `/v1/customer/partners/${env.PAYPAL_PARTNER_ID}/merchant-integrations?tracking_id=${encodeURIComponent(connection.trackingId)}`,
        { priority: "high", deadline },
      );
      integration = integrationRows(result).find(
        (row) => !row.tracking_id || row.tracking_id === connection.trackingId,
      );
    } catch (error) {
      if (
        !(error instanceof PayPalApiError) ||
        ![403, 404].includes(error.status)
      )
        throw error;
    }
  }
  if (!integration) {
    const paypalId = connection.merchantIdInPayPal ?? hint;
    if (paypalId && /^[A-Z0-9]{13}$/.test(paypalId)) {
      const row = await client.request<Integration>(
        `/v1/customer/partners/${env.PAYPAL_PARTNER_ID}/merchant-integrations/${encodeURIComponent(paypalId)}`,
        { priority: "high", deadline },
      );
      // A callback cannot claim an unrelated seller's already-granted account.
      if (
        connection.merchantIdInPayPal === paypalId ||
        row.tracking_id === connection.trackingId
      )
        integration = row;
    }
  }
  // The tracking lookup can return only an ID and a link to the full status.
  if (
    integration?.merchant_id &&
    /^[A-Z0-9]{13}$/.test(integration.merchant_id) &&
    (typeof integration.payments_receivable !== "boolean" ||
      typeof integration.primary_email_confirmed !== "boolean" ||
      !integration.oauth_integrations)
  ) {
    const details = await client.request<Integration>(
      `/v1/customer/partners/${env.PAYPAL_PARTNER_ID}/merchant-integrations/${encodeURIComponent(integration.merchant_id)}`,
      { priority: "high", deadline },
    );
    integration =
      details.merchant_id === integration.merchant_id &&
      (!details.tracking_id ||
        details.tracking_id === connection.trackingId ||
        connection.merchantIdInPayPal === details.merchant_id)
        ? details
        : undefined;
  }
  if (
    !integration?.merchant_id ||
    !/^[A-Z0-9]{13}$/.test(integration.merchant_id)
  ) {
    await getDb()
      .update(connections)
      .set({
        lastStatusCheckAt: new Date(),
        error: "PayPal has not confirmed this connection yet",
      })
      .where(
        and(
          eq(connections.merchantId, merchantId),
          eq(connections.status, "PENDING"),
        ),
      );
    return (
      await getDb()
        .select()
        .from(connections)
        .where(eq(connections.merchantId, merchantId))
    )[0];
  }
  const decision = connectionDecision(integration, env.PAYPAL_CLIENT_ID);
  return getDb().transaction(async (tx) => {
    await lockMerchant(tx, merchantId);
    const [current] = await tx
      .select()
      .from(connections)
      .where(eq(connections.merchantId, merchantId));
    if (
      !current ||
      current.mode !== "PARTNER" ||
      ["DISCONNECTED", "REVOKED"].includes(current.status)
    )
      return current;
    if (current.trackingId !== connection.trackingId) return current;
    if (decision.status === "CONNECTED")
      await claimAccount(tx, merchantId, integration!.merchant_id!);
    const [updated] = await tx
      .update(connections)
      .set({
        merchantIdInPayPal: integration!.merchant_id!,
        status: decision.status,
        scopes: decision.scopes,
        consentStatus: decision.status === "CONNECTED" ? "GRANTED" : "PENDING",
        paymentsReceivable: decision.paymentsReceivable,
        primaryEmailConfirmed: decision.primaryEmailConfirmed,
        lastStatusCheckAt: new Date(),
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(connections.merchantId, merchantId))
      .returning();
    if (decision.status === "CONNECTED") {
      await tx
        .update(merchants)
        .set({ onboardingStep: "history", purgeAfter: null })
        .where(
          and(
            eq(merchants.id, merchantId),
            eq(merchants.onboardingStep, "connect"),
          ),
        );
      if (current.status !== "CONNECTED")
        await audit(tx, merchantId, "merchant.connected", merchantId, {
          mode: "PARTNER",
          searchEnabled: decision.searchEnabled,
        });
    }
    return updated;
  });
}
export async function startPartnerConnection(
  userId: string,
  merchantId: string,
  ip: string,
) {
  const token = await beginAttempt(userId, merchantId, ip);
  let [old] = await getDb()
    .select()
    .from(connections)
    .where(eq(connections.merchantId, merchantId));
  if (old?.status === "CONNECTED" && old.mode === "PARTNER") {
    try {
      old = (await refreshPartnerConnection(merchantId)) ?? old;
    } catch {
      /* Preserve the existing verified grant during an API outage. */
    }
  }
  const scopes = old?.scopes ?? [];
  const optional = [
    ...(scopes.some((scope) => scope.includes("/vault/payment-tokens/"))
      ? ["VAULT"]
      : []),
    ...(scopes.some((scope) => scope.includes("billing-agreements"))
      ? ["BILLING_AGREEMENT"]
      : []),
    ...(scopes.some((scope) => scope.includes("futurepayments"))
      ? ["FUTURE_PAYMENT"]
      : []),
  ];
  const referral = await createReferral(merchantId, optional),
    url = referral.links.find((link) => link.rel === "action_url")?.href;
  if (
    !url ||
    ![
      "www.sandbox.paypal.com",
      "sandbox.paypal.com",
      "www.paypal.com",
      "paypal.com",
    ].includes(new URL(url).hostname) ||
    new URL(url).protocol !== "https:"
  )
    throw new Error("PayPal did not return a valid connection link");
  await getDb().transaction(async (tx) => {
    await assertConnectionOwner(tx, userId, merchantId);
    await lockMerchant(tx, merchantId);
    await checkAttempt(tx, merchantId, token);
    await tx
      .insert(connections)
      .values({
        merchantId,
        mode: "PARTNER",
        trackingId: merchantId,
        status: "PENDING",
        merchantIdInPayPal: old?.merchantIdInPayPal,
        webhookId: old?.webhookId ?? getEnv().PAYPAL_WEBHOOK_ID,
        scopes: old?.scopes ?? [],
      })
      .onConflictDoUpdate({
        target: connections.merchantId,
        set: {
          mode: "PARTNER",
          trackingId: merchantId,
          status: "PENDING",
          clientId: null,
          clientSecretEnc: null,
          consentStatus: "PENDING",
          error: null,
          updatedAt: new Date(),
        },
      });
    await tx
      .update(merchants)
      .set({ onboardingStep: "connect" })
      .where(eq(merchants.id, merchantId));
  });
  return url;
}
export const byoSchema = z.object({
  clientId: z.string().trim().min(5).max(512),
  clientSecret: z.string().trim().min(5).max(2048),
  merchantIdInPayPal: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z
      .string()
      .regex(/^[A-Z0-9]{13}$/)
      .optional(),
  ),
});
export class ConnectionInputError extends Error {}
export async function identifyByoMerchant(
  client: ReturnType<typeof createPayPalClient>,
  scopes: string[],
  pastedId?: string,
) {
  if (scopes.includes(SEARCH_SCOPE)) {
    const now = new Date(),
      params = new URLSearchParams({
        start_date: new Date(+now - 86400000).toISOString(),
        end_date: now.toISOString(),
        fields: "transaction_info",
        page_size: "1",
      });
    try {
      const report = await client.request<{ account_number?: string }>(
        `/v1/reporting/transactions?${params}`,
        { priority: "low", deadline: Date.now() + 20000 },
      );
      if (/^[A-Z0-9]{13}$/.test(report.account_number ?? "")) {
        if (pastedId && pastedId !== report.account_number)
          throw new ConnectionInputError(
            "The Merchant ID does not belong to this app. Leave it blank to use the account verified by PayPal, or choose the correct app.",
          );
        return report.account_number!;
      }
    } catch (error) {
      if (
        !(error instanceof PayPalApiError) ||
        ![403, 404].includes(error.status)
      )
        throw error;
    }
  }
  if (!pastedId)
    throw new ConnectionInputError(
      "PayPal could not provide the app's Merchant ID. Enable Transaction Search or paste the 13-character ID from that Business account's settings.",
    );
  return pastedId;
}
export async function registerMerchantWebhook(
  client: ReturnType<typeof createPayPalClient>,
  url: string,
) {
  const result = await client.request<{
      webhooks?: {
        id: string;
        url: string;
        event_types?: { name: string }[];
      }[];
    }>("/v1/notifications/webhooks"),
    hooks = result.webhooks ?? [],
    existing = hooks.find((hook) => hook.url === url);
  if (existing) {
    if (
      !webhookEventTypes.every((type) =>
        existing.event_types?.some((item) => item.name === type),
      )
    )
      await client.request(`/v1/notifications/webhooks/${existing.id}`, {
        method: "PATCH",
        body: [
          {
            op: "replace",
            path: "/event_types",
            value: webhookEventTypes.map((name) => ({ name })),
          },
        ],
      });
    return existing.id;
  }
  if (hooks.length >= 10)
    throw new ConnectionInputError(
      "Your PayPal app already has 10 webhook URLs. Remove an unused URL in its developer settings and retry.",
    );
  try {
    const created = await client.request<{ id: string }>(
      "/v1/notifications/webhooks",
      {
        method: "POST",
        body: { url, event_types: webhookEventTypes.map((name) => ({ name })) },
      },
    );
    if (!created.id) throw new Error("Webhook registration failed");
    return created.id;
  } catch (error) {
    if (
      !(error instanceof PayPalApiError) ||
      !error.details.some((item) => /ALREADY.*EXIST/.test(item.issue ?? ""))
    )
      throw error;
    const retry = await client.request<{
      webhooks?: { id: string; url: string }[];
    }>("/v1/notifications/webhooks");
    const found = retry.webhooks?.find((hook) => hook.url === url);
    if (!found) throw new Error("Webhook registration could not be confirmed");
    return found.id;
  }
}
export async function connectByo(
  userId: string,
  merchantId: string,
  input: unknown,
  ip: string,
  makeClient = createPayPalClient,
) {
  const fields = byoSchema.parse(input),
    token = await beginAttempt(userId, merchantId, ip),
    env = getEnv();
  const client = makeClient({
    clientId: fields.clientId,
    clientSecret: fields.clientSecret,
    environment: env.KICKBACK_ENV,
    retries: 0,
  });
  const auth = await client.accessToken(),
    scopes = auth.scope?.split(" ") ?? [];
  if (![PAYMENT_SCOPE, REFUND_SCOPE].every((scope) => scopes.includes(scope)))
    throw new ConnectionInputError(
      "Enable checkout and refunds on this PayPal app before connecting",
    );
  const merchantIdInPayPal = await identifyByoMerchant(
    client,
    scopes,
    fields.merchantIdInPayPal,
  );
  const webhookId = await registerMerchantWebhook(
    client,
    new URL("/api/paypal/webhook", env.APP_URL).href,
  );
  await getDb().transaction(async (tx) => {
    await assertConnectionOwner(tx, userId, merchantId);
    await lockMerchant(tx, merchantId);
    await checkAttempt(tx, merchantId, token);
    await claimAccount(tx, merchantId, merchantIdInPayPal);
    const value = {
      merchantId,
      mode: "BYO" as const,
      merchantIdInPayPal,
      clientId: fields.clientId,
      clientSecretEnc: encryptSecret(fields.clientSecret, merchantId),
      status: "CONNECTED",
      consentStatus: "GRANTED",
      scopes,
      webhookId,
      webhookRegisteredAt: new Date(),
      lastStatusCheckAt: new Date(),
      error: null,
      updatedAt: new Date(),
    };
    await tx
      .insert(connections)
      .values(value)
      .onConflictDoUpdate({ target: connections.merchantId, set: value });
    await tx
      .update(merchants)
      .set({ purgeAfter: null })
      .where(eq(merchants.id, merchantId));
    await tx
      .update(merchants)
      .set({ onboardingStep: "history" })
      .where(
        and(
          eq(merchants.id, merchantId),
          eq(merchants.onboardingStep, "connect"),
        ),
      );
    await audit(tx, merchantId, "merchant.connected", merchantId, {
      mode: "BYO",
      searchEnabled: scopes.includes(SEARCH_SCOPE),
    });
  });
  return { searchEnabled: scopes.includes(SEARCH_SCOPE) };
}
export async function refreshPendingConnections(
  resource: Record<string, unknown> = {},
  deadline = Date.now() + 20000,
) {
  const pending = await getDb()
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.mode, "PARTNER"),
        eq(connections.status, "PENDING"),
        isNotNull(connections.trackingId),
      ),
    )
    .limit(20);
  const tracking =
      typeof resource.tracking_id === "string"
        ? resource.tracking_id
        : undefined,
    paypalId =
      typeof resource.merchant_id === "string"
        ? resource.merchant_id
        : undefined;
  const matched = pending.filter(
    (row) =>
      (tracking && row.trackingId === tracking) ||
      (paypalId && row.merchantIdInPayPal === paypalId),
  );
  let checked = 0;
  for (const row of matched.length ? matched : pending) {
    if (Date.now() > deadline - 5000) break;
    try {
      await refreshPartnerConnection(
        row.merchantId,
        undefined,
        getPayPalClient(),
        deadline,
      );
      checked++;
    } catch {
      /* Leave pending for the next poll or sweep. */
    }
  }
  return checked;
}

import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getDb } from "@/db";
import { auditLog, connections, user } from "@/db/schema";
import { resetDb, setupDb, teardownDb } from "./helpers/db";
import { saveBusiness } from "@/lib/onboarding";
import {
  connectByo,
  PAYMENT_SCOPE,
  REFUND_SCOPE,
  SEARCH_SCOPE,
  registerMerchantWebhook,
  identifyByoMerchant,
} from "@/lib/connections";
import { createPayPalClient, PayPalApiError } from "@/lib/paypal/client";
import { decryptSecret } from "@/lib/crypto/tenant";
import { webhookEventTypes } from "@/lib/paypal/events";
function mockClient(scopes = [PAYMENT_SCOPE, REFUND_SCOPE, SEARCH_SCOPE]) {
  return {
    accessToken: vi.fn(async () => ({ scope: scopes.join(" ") })),
    request: vi.fn(async (_path: string, options?: { method?: string }) =>
      options?.method === "POST" ? { id: "HOOK" } : { webhooks: [] },
    ),
  } as unknown as ReturnType<typeof createPayPalClient>;
}
async function owner() {
  const id = randomUUID();
  await getDb()
    .insert(user)
    .values({
      id,
      name: "Owner",
      email: `${id}@example.com`,
      updatedAt: new Date(),
    });
  const merchant = await saveBusiness(id, {
    displayName: "My Cafe",
    slug: "my-cafe",
    tz: "America/New_York",
    category: "cafe",
  });
  return { id, merchant };
}
beforeAll(setupDb);
beforeEach(resetDb);
afterAll(teardownDb);
describe("merchant API credentials", () => {
  it("learns the app's account ID from reporting and rejects a mismatched pasted ID", async () => {
    const client = mockClient();
    vi.mocked(client.request).mockResolvedValue({
      account_number: "ABCDEF1234567",
    });
    expect(await identifyByoMerchant(client, [SEARCH_SCOPE])).toBe(
      "ABCDEF1234567",
    );
    await expect(
      identifyByoMerchant(client, [SEARCH_SCOPE], "ZZZZZZ1234567"),
    ).rejects.toThrow(/does not belong/);
    await expect(identifyByoMerchant(client, [])).rejects.toThrow(
      /could not provide/,
    );
  });
  it("probes scopes, registers a listener, seals with tenant AAD and never audits the secret", async () => {
    const { id, merchant } = await owner(),
      client = mockClient(),
      secret = "private-client-secret";
    expect(
      await connectByo(
        id,
        merchant.id,
        {
          clientId: "my-client-id",
          clientSecret: secret,
          merchantIdInPayPal: "ABCDEF1234567",
        },
        "203.0.113.4",
        () => client,
      ),
    ).toEqual({ searchEnabled: true });
    const [connection] = await getDb().select().from(connections);
    expect(connection.status).toBe("CONNECTED");
    expect(connection.webhookId).toBe("HOOK");
    expect(decryptSecret(connection.clientSecretEnc!, merchant.id)).toBe(
      secret,
    );
    expect(() =>
      decryptSecret(connection.clientSecretEnc!, "another-merchant"),
    ).toThrow();
    expect(JSON.stringify(await getDb().select().from(auditLog))).not.toContain(
      secret,
    );
  });
  it("requires checkout and refund scopes while Search is optional", async () => {
    const { id, merchant } = await owner(),
      fields = {
        clientId: "client-id",
        clientSecret: "client-secret",
        merchantIdInPayPal: "ABCDEF1234567",
      };
    await expect(
      connectByo(id, merchant.id, fields, "ip", () =>
        mockClient([PAYMENT_SCOPE]),
      ),
    ).rejects.toThrow(/checkout and refunds/);
    expect(
      await connectByo(id, merchant.id, fields, "ip", () =>
        mockClient([PAYMENT_SCOPE, REFUND_SCOPE]),
      ),
    ).toEqual({ searchEnabled: false });
  });
  it("reuses the listener and updates its event types", async () => {
    const client = mockClient();
    vi.mocked(client.request).mockResolvedValue({
      webhooks: [
        { id: "EXISTING", url: "https://app.test/hook", event_types: [] },
      ],
    });
    expect(await registerMerchantWebhook(client, "https://app.test/hook")).toBe(
      "EXISTING",
    );
    expect(client.request).toHaveBeenLastCalledWith(
      "/v1/notifications/webhooks/EXISTING",
      expect.objectContaining({
        method: "PATCH",
        body: expect.arrayContaining([
          expect.objectContaining({
            value: webhookEventTypes.map((name) => ({ name })),
          }),
        ]),
      }),
    );
  });
  it("refuses the ten-listener cap and confirms an already-existing race", async () => {
    const client = mockClient();
    vi.mocked(client.request).mockResolvedValueOnce({
      webhooks: Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        url: `https://other.test/${i}`,
      })),
    });
    await expect(
      registerMerchantWebhook(client, "https://app.test/hook"),
    ).rejects.toThrow(/10 webhook/);
    vi.mocked(client.request)
      .mockResolvedValueOnce({ webhooks: [] })
      .mockRejectedValueOnce(
        new PayPalApiError(400, {
          details: [{ issue: "WEBHOOK_ALREADY_EXISTS" }],
        }),
      )
      .mockResolvedValueOnce({
        webhooks: [{ id: "RACE", url: "https://app.test/hook" }],
      });
    expect(await registerMerchantWebhook(client, "https://app.test/hook")).toBe(
      "RACE",
    );
  });
});

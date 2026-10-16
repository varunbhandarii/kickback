import { vi, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  read: vi.fn(),
  configs: [] as Record<string, unknown>[],
}));
vi.mock("@/lib/merchants", () => ({ connectionContext: mocks.context }));
vi.mock("@paypal/paypal-server-sdk", () => ({
  Environment: { Sandbox: "Sandbox", Production: "Production" },
  Client: class {
    constructor(config: Record<string, unknown>) {
      mocks.configs.push(config);
    }
  },
  OrdersController: class {
    getOrder = mocks.read;
  },
  ApiError: class extends Error {
    constructor(readonly statusCode: number) {
      super("provider body must remain private");
    }
  },
}));
import { lookupOrder } from "@/lib/paypal/order-lookup";
import { ApiError } from "@paypal/paypal-server-sdk";
import { setupDb, teardownDb } from "./helpers/db";
beforeAll(setupDb);
afterAll(teardownDb);
beforeEach(() => {
  mocks.context.mockResolvedValue({
    clientId: "tenant-client",
    assertionMerchantId: "MERCHANT12345",
    client: {
      accessToken: async () => ({
        access_token: "ephemeral",
        expiresAt: Date.now() + 3600000,
      }),
    },
  });
  mocks.read.mockReset();
  mocks.configs.length = 0;
});
it("uses the SDK with the connected merchant's assertion and projects receipt fields", async () => {
  mocks.read.mockResolvedValue({
    result: {
      id: "ORDER123",
      status: "COMPLETED",
      payer: { emailAddress: "private@example.com" },
      purchaseUnits: [
        {
          amount: { value: "5.50" },
          items: [
            {
              name: "Latte",
              description: "loyalty reward",
              url: "https://app.test/terms",
            },
          ],
        },
      ],
    },
  });
  const data = await lookupOrder("tenant", "ORDER123");
  expect(data.units?.[0].items?.[0].name).toBe("Latte");
  expect(JSON.stringify(data)).not.toContain("private@example.com");
  const args = mocks.read.mock.calls[0][0];
  expect(
    JSON.parse(
      Buffer.from(args.paypalAuthAssertion.split(".")[1], "base64").toString(),
    ),
  ).toEqual({ iss: "tenant-client", payer_id: "MERCHANT12345" });
  expect(mocks.configs[0].environment).toBe("Sandbox");
});
it("rejects invalid IDs before token access", async () => {
  await expect(lookupOrder("tenant", "../other")).rejects.toMatchObject({
    status: 400,
  });
  expect(mocks.context).not.toHaveBeenCalled();
});
it("does not expose provider errors", async () => {
  mocks.read.mockRejectedValue(
    Object.assign(Object.create(ApiError.prototype), { statusCode: 404 }),
  );
  await expect(lookupOrder("tenant", "ORDER123")).rejects.toMatchObject({
    status: 404,
    message: "Order lookup unavailable",
  });
});

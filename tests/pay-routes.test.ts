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
import { POST as create } from "@/app/api/pay/create-order/route";
import { POST as capture } from "@/app/api/pay/capture-order/route";
import { GET as status } from "@/app/api/pay/reward/[id]/route";
import { signRewardToken, verifyRewardToken } from "@/lib/crypto/reward-token";
import { signOrderToken } from "@/lib/crypto/order-token";
import { resetRateLimits } from "@/lib/rate-limit";
import { PayPalApiError } from "@/lib/paypal/client";
import { setupDb, teardownDb, resetDb, fixture, milestone } from "./helpers/db";
import { createPayment } from "@/lib/payments/create";
import { persistWebhook } from "@/lib/paypal/webhooks";
import { dispatch } from "@/lib/webhooks/dispatch";
import { getDb } from "@/db";
import { visits } from "@/db/schema";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/paypal/client", async (original) => ({
  ...(await original<typeof import("@/lib/paypal/client")>()),
  getPayPalClient: () => ({ request }),
}));
vi.mock("next/server", () => ({ after: vi.fn() }));
beforeAll(setupDb, 30000);
afterAll(teardownDb);
beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  request.mockReset();
});
const post = (body: unknown) =>
  new Request("https://app.test/api/pay/create-order", {
    method: "POST",
    headers: { Origin: "https://app.test", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
describe("merchant checkout API", () => {
  it("preserves a reserved historical clock when a vaulted order auto-captures before creation returns", async () => {
    await fixture();
    const at = new Date(Date.now() - 4 * 86400000);
    let order: Record<string, unknown>;
    request.mockImplementation(async (path, options) => {
      if (path === "/v2/checkout/orders") {
        const unit = options.body.purchase_units[0];
        order = {
          id: "AUTOCAPTURE12345",
          status: "COMPLETED",
          payment_source: { paypal: { account_id: "SECRET_BUYER" } },
          purchase_units: [
            {
              ...unit,
              payments: {
                captures: [
                  {
                    id: "AUTO_CAPTURE123",
                    status: "COMPLETED",
                    create_time: new Date().toISOString(),
                    amount: unit.amount,
                  },
                ],
              },
            },
          ],
        };
        const event = {
          id: "WEBHOOK_FIRST",
          event_type: "PAYMENT.CAPTURE.COMPLETED",
          resource: {
            id: "AUTO_CAPTURE123",
            custom_id: unit.custom_id,
            supplementary_data: {
              related_ids: { order_id: "AUTOCAPTURE12345" },
            },
          },
        };
        await persistWebhook(event);
        await dispatch(event);
        return order;
      }
      return order;
    });
    await createPayment(
      {
        slug: "rosas",
        wallet: "paypal",
        amountCents: 550,
        requestId: randomUUID(),
      },
      "synthetic-vault-token",
      at,
    );
    expect(await getDb().select().from(visits)).toMatchObject([
      { startedAt: at },
    ]);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("uses menu prices and signs the persisted context", async () => {
    await fixture();
    request.mockResolvedValue({ id: "ORDER123456789", status: "CREATED" });
    const requestId = randomUUID(),
      response = await create(
        post({
          slug: "rosas",
          wallet: "paypal",
          itemId: "latte",
          amountCents: 100,
          requestId,
        }),
      );
    expect(response.status).toBe(200);
    expect(request.mock.calls[0][1]).toMatchObject({
      body: {
        purchase_units: [
          { amount: { value: "5.50" }, items: [{ name: "Latte" }] },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: "Rosa's Cafe",
              shipping_preference: "NO_SHIPPING",
            },
          },
        },
      },
    });
    const second = await create(
      post({ slug: "rosas", wallet: "paypal", itemId: "latte", requestId }),
    );
    expect(second.status).toBe(200);
    expect(request).toHaveBeenCalledTimes(1);
    expect((await response.json()).orderToken).toBeTypeOf("string");
  });
  it("rejects reuse of a nonce for a different purchase", async () => {
    await fixture();
    request.mockResolvedValue({ id: "ORDER123456789", status: "CREATED" });
    const requestId = randomUUID();
    await create(
      post({ slug: "rosas", wallet: "paypal", amountCents: 550, requestId }),
    );
    expect(
      (
        await create(
          post({ slug: "rosas", wallet: "venmo", amountCents: 550, requestId }),
        )
      ).status,
    ).toBe(409);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("limits order creation before contacting PayPal", async () => {
    for (let n = 0; n < 20; n++)
      await create(
        post({
          slug: "missing",
          wallet: "paypal",
          amountCents: 550,
          requestId: randomUUID(),
        }),
      );
    expect(
      (
        await create(
          post({
            slug: "missing",
            wallet: "paypal",
            amountCents: 550,
            requestId: randomUUID(),
          }),
        )
      ).status,
    ).toBe(429);
    expect(request).not.toHaveBeenCalled();
  });
  it("validates custom amounts and unknown menu items", async () => {
    await fixture();
    for (const amountCents of [99, 50001, 1.5])
      expect(
        (
          await create(
            post({
              slug: "rosas",
              wallet: "paypal",
              amountCents,
              requestId: randomUUID(),
            }),
          )
        ).status,
      ).toBe(400);
    expect(
      (
        await create(
          post({
            slug: "rosas",
            wallet: "paypal",
            itemId: "missing",
            requestId: randomUUID(),
          }),
        )
      ).status,
    ).toBe(400);
    expect(request).not.toHaveBeenCalled();
  });
  it("captures and replays without exposing provider identity", async () => {
    const merchant = await fixture();
    request.mockResolvedValueOnce({ id: "ORDER123456789", status: "CREATED" });
    const created = await (
      await create(
        post({
          slug: "rosas",
          wallet: "paypal",
          amountCents: 550,
          requestId: randomUUID(),
        }),
      )
    ).json();
    request.mockResolvedValue({
      id: created.orderId,
      status: "COMPLETED",
      payment_source: { paypal: { account_id: "SECRET_BUYER" } },
      purchase_units: [
        {
          payee: { merchant_id: "MERCHANT12345" },
          payments: {
            captures: [
              {
                id: "CAPTURE123456",
                status: "COMPLETED",
                amount: { value: "5.50", currency_code: "USD" },
              },
            ],
          },
        },
      ],
    });
    for (let n = 0; n < 2; n++) {
      const response = await capture(post(created));
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toMatchObject({
        recognized: true,
        progress: { current: 1 },
      });
      expect(JSON.stringify(data)).not.toContain("SECRET_BUYER");
    }
    expect(request).toHaveBeenCalledTimes(2);
    const bad = signOrderToken({
      orderId: created.orderId,
      merchant: merchant.id,
      slug: "salon",
      requestId: randomUUID(),
      wallet: "paypal",
      amountCents: 550,
    });
    expect(
      (await capture(post({ orderId: created.orderId, orderToken: bad })))
        .status,
    ).toBe(400);
  });
  it.each([
    "INSTRUMENT_DECLINED",
    "PAYER_ACTION_REQUIRED",
    "ORDER_NOT_APPROVED",
  ])("offers a new order for %s", async (issue) => {
    await fixture();
    request.mockResolvedValueOnce({ id: "ORDER123456789", status: "CREATED" });
    const created = await (
      await create(
        post({
          slug: "rosas",
          wallet: "paypal",
          amountCents: 550,
          requestId: randomUUID(),
        }),
      )
    ).json();
    request.mockRejectedValue(
      new PayPalApiError(422, { details: [{ issue }] }),
    );
    const response = await capture(post(created));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      retryable: true,
      error: issue,
    });
  });
  it("guards reward status with a short-lived token tied to its ID", async () => {
    const { reward } = await milestone(await fixture()),
      token = signRewardToken(reward.id),
      ctx = { params: Promise.resolve({ id: reward.id }) };
    expect(
      (
        await status(
          new Request(`https://app.test/api/pay/reward/${reward.id}?t=bad`),
          ctx,
        )
      ).status,
    ).toBe(403);
    const response = await status(
      new Request(`https://app.test/api/pay/reward/${reward.id}?t=${token}`),
      ctx,
    );
    expect(await response.json()).toEqual({
      state: "SCHEDULED",
      amountCents: 200,
    });
    expect(verifyRewardToken(token, randomUUID())).toBe(false);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 3600001);
    expect(verifyRewardToken(token, reward.id)).toBe(false);
    vi.restoreAllMocks();
  });
});
it.each([undefined, "latte"])(
  "sends one factual receipt item for %s",
  async (itemId) => {
    await fixture();
    request.mockResolvedValue({ id: "ORDERRECEIPT123", status: "CREATED" });
    expect(
      (
        await create(
          post({
            slug: "rosas",
            wallet: "paypal",
            itemId,
            amountCents: 550,
            requestId: randomUUID(),
          }),
        )
      ).status,
    ).toBe(200);
    const unit = request.mock.calls[0][1].body.purchase_units[0];
    expect(unit.items).toHaveLength(1);
    expect(unit.items[0]).toMatchObject({
      name: itemId ? "Latte" : "Payment to Rosa's Cafe",
      url: "https://app.test/pay/rosas/terms",
      quantity: "1",
      unit_amount: { currency_code: "USD", value: "5.50" },
    });
    expect(unit.items[0].description).toContain("loyalty reward");
    expect(unit.items[0].category).toBeUndefined();
    expect(unit.amount.breakdown.item_total).toEqual(unit.items[0].unit_amount);
  },
);

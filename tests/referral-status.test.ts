import { randomUUID } from "node:crypto";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  connections,
  merchantUsers,
  merchants,
  user,
  webhookEvents,
} from "@/db/schema";
import { resetDb, setupDb, teardownDb } from "./helpers/db";
import { saveBusiness } from "@/lib/onboarding";
import {
  PAYMENT_SCOPE,
  REFUND_SCOPE,
  refreshPartnerConnection,
} from "@/lib/connections";
import { dispatch } from "@/lib/webhooks/dispatch";
import { GET } from "@/app/api/paypal/referral/return/route";
const { request, sessionOwner } = vi.hoisted(() => ({
  request: vi.fn(),
  sessionOwner: { id: "" },
}));
vi.mock("@/lib/paypal/client", async (original) => ({
  ...(await original<typeof import("@/lib/paypal/client")>()),
  getPayPalClient: () => ({ request }),
}));
vi.mock("@/lib/dal", () => ({
  getSession: async () =>
    sessionOwner.id ? { user: { id: sessionOwner.id } } : null,
  ownedMerchant: async (id: string, merchantId: string) => {
    const [owner] = await getDb()
      .select()
      .from(merchantUsers)
      .where(
        and(
          eq(merchantUsers.userId, id),
          eq(merchantUsers.merchantId, merchantId),
        ),
      );
    return owner;
  },
}));
async function pending(slug = "my-cafe") {
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
    displayName: "Cafe",
    slug,
    tz: "America/New_York",
    category: "cafe",
  });
  await getDb().insert(connections).values({
    merchantId: merchant.id,
    mode: "PARTNER",
    trackingId: merchant.id,
    status: "PENDING",
  });
  return { id, merchant };
}
const integration = (tracking: string, confirmed = true) => ({
  merchant_id: "ABCDEF1234567",
  tracking_id: tracking,
  payments_receivable: true,
  primary_email_confirmed: confirmed,
  oauth_integrations: [
    {
      status: "A",
      oauth_third_party: [
        { partner_client_id: "client", scopes: [PAYMENT_SCOPE, REFUND_SCOPE] },
      ],
    },
  ],
});
beforeAll(setupDb);
beforeEach(async () => {
  await resetDb();
  vi.stubEnv("PAYPAL_PARTNER_ID", "PARTNER123456");
  request.mockReset();
  sessionOwner.id = "";
});
afterAll(teardownDb);
describe("partner onboarding truth and callback ownership", () => {
  it("ignores approval hints until PayPal confirms email and scopes", async () => {
    const { id, merchant } = await pending();
    sessionOwner.id = id;
    request.mockResolvedValue([integration(merchant.id, false)]);
    const response = await GET(
      new Request(
        `https://app.test/api/paypal/referral/return?merchantId=${merchant.id}&merchantIdInPayPal=ABCDEF1234567&permissionsGranted=true&isEmailConfirmed=true`,
      ),
    );
    expect(response.headers.get("location")).toContain("state=pending");
    expect((await getDb().select().from(connections))[0].status).toBe(
      "PENDING",
    );
    request.mockResolvedValue([integration(merchant.id)]);
    const verified = await GET(
      new Request(
        `https://app.test/api/paypal/referral/return?merchantId=${merchant.id}`,
      ),
    );
    expect(verified.headers.get("location")).toContain("state=connected");
    expect(verified.headers.get("set-cookie")).toContain(merchant.id);
    expect((await getDb().select().from(merchants))[0].onboardingStep).toBe(
      "history",
    );
  });
  it("does not allow a callback to claim another owner's tracked business", async () => {
    const first = await pending(),
      second = await pending("other-cafe");
    sessionOwner.id = second.id;
    const response = await GET(
      new Request(
        `https://app.test/api/paypal/referral/return?merchantId=${first.merchant.id}&permissionsGranted=true`,
      ),
    );
    expect(response.headers.get("location")).toContain("unconfirmed");
    expect(request).not.toHaveBeenCalled();
  });
  it("rejects a forged fallback account that belongs to a different tracking ID", async () => {
    const { merchant } = await pending();
    request
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(integration(randomUUID()));
    const connection = await refreshPartnerConnection(
      merchant.id,
      "ABCDEF1234567",
    );
    expect(connection?.status).toBe("PENDING");
    expect(connection?.merchantIdInPayPal).toBeNull();
  });
  it("uses already-integrated webhooks as a re-query trigger without trusting their payload", async () => {
    const { merchant } = await pending();
    request.mockResolvedValue([integration(merchant.id)]);
    const event = {
      id: "WH-INTEGRATED",
      event_type: "CUSTOMER.MERCHANT-INTEGRATION.SELLER-ALREADY-INTEGRATED",
      resource: { permissionsGranted: true },
    };
    await getDb()
      .insert(webhookEvents)
      .values({ eventId: event.id, eventType: event.event_type });
    expect((await dispatch(event)).processed).toBe(true);
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining(`tracking_id=${merchant.id}`),
      expect.anything(),
    );
    expect((await getDb().select().from(connections))[0].status).toBe(
      "CONNECTED",
    );
  });
});

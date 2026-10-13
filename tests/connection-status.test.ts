import { describe, expect, it } from "vitest";
import {
  connectionDecision,
  PAYMENT_SCOPE,
  REFUND_SCOPE,
  SEARCH_SCOPE,
  type Integration,
} from "@/lib/connections";
const valid: Integration = {
  merchant_id: "MERCHANT12345A",
  payments_receivable: true,
  primary_email_confirmed: true,
  oauth_integrations: [
    {
      status: "A",
      oauth_third_party: [
        {
          partner_client_id: "our-app",
          scopes: [PAYMENT_SCOPE, REFUND_SCOPE, SEARCH_SCOPE],
        },
      ],
    },
  ],
};
describe("verified partner gate", () => {
  it("requires receivable, confirmed email, and both current-app payment scopes", () => {
    expect(connectionDecision(valid, "our-app").status).toBe("CONNECTED");
    for (const integration of [
      { ...valid, payments_receivable: false },
      { ...valid, primary_email_confirmed: false },
      { ...valid, oauth_integrations: [] },
    ])
      expect(connectionDecision(integration, "our-app").status).toBe("PENDING");
    expect(connectionDecision(valid, "a-different-app").status).toBe("PENDING");
    expect(
      connectionDecision(
        {
          ...valid,
          oauth_integrations: [
            {
              status: "I",
              oauth_third_party: valid.oauth_integrations![0].oauth_third_party,
            },
          ],
        },
        "our-app",
      ).status,
    ).toBe("PENDING");
  });
  it("allows checkout without reporting scope and detects history separately", () => {
    const integration = {
      ...valid,
      oauth_integrations: [
        {
          oauth_third_party: [
            {
              partner_client_id: "our-app",
              scopes: [PAYMENT_SCOPE, REFUND_SCOPE],
            },
          ],
        },
      ],
    };
    expect(connectionDecision(integration, "our-app")).toMatchObject({
      status: "CONNECTED",
      searchEnabled: false,
    });
  });
});

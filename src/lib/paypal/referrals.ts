import { randomUUID } from "node:crypto";
import { getEnv } from "../env";
import { paypalFetch } from "./client";
export async function createReferral(
  trackingId: string = randomUUID(),
  preserveFeatures: string[] = [],
) {
  const env = getEnv();
  const optional = preserveFeatures.filter((feature) =>
    ["VAULT", "BILLING_AGREEMENT", "FUTURE_PAYMENT"].includes(feature),
  );
  return paypalFetch<{ links: { rel: string; href: string }[] }>(
    "/v2/customer/partner-referrals",
    {
      method: "POST",
      body: {
        tracking_id: trackingId,
        operations: [
          {
            operation: "API_INTEGRATION",
            api_integration_preference: {
              rest_api_integration: {
                integration_method: "PAYPAL",
                integration_type: "THIRD_PARTY",
                third_party_details: {
                  features: [
                    ...new Set([
                      "PAYMENT",
                      "REFUND",
                      "ACCESS_MERCHANT_INFORMATION",
                      "ADVANCED_TRANSACTIONS_SEARCH",
                      "READ_SELLER_DISPUTE",
                      "UPDATE_SELLER_DISPUTE",
                      ...optional,
                    ]),
                  ],
                },
              },
            },
          },
        ],
        products: ["EXPRESS_CHECKOUT"],
        legal_consents: [{ type: "SHARE_DATA_CONSENT", granted: true }],
        partner_config_override: {
          return_url: new URL("/api/paypal/referral/return", env.APP_URL).href,
        },
      },
    },
  );
}
export function merchantIntegration(merchantId: string) {
  const env = getEnv();
  if (!env.PAYPAL_PARTNER_ID) throw new Error("PAYPAL_PARTNER_ID is required");
  return paypalFetch(
    `/v1/customer/partners/${env.PAYPAL_PARTNER_ID}/merchant-integrations/${encodeURIComponent(merchantId)}`,
  );
}

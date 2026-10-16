import {
  Client,
  Environment,
  OrdersController,
  ApiError,
} from "@paypal/paypal-server-sdk";
import { connectionContext } from "../merchants";
import { getEnv } from "../env";
import { authAssertion } from "./auth";
export class OrderLookupError extends Error {
  constructor(readonly status: number) {
    super("Order lookup unavailable");
  }
}
// Bounded operator read, using the existing tenant's token manager. Money operations use our paced client.
export async function lookupOrder(merchantId: string, id: string) {
  if (!/^[A-Z0-9]{1,40}$/.test(id)) throw new OrderLookupError(400);
  const ctx = await connectionContext(merchantId),
    deadline = Date.now() + 30000;
  const token = await ctx.client.accessToken("high", deadline);
  const client = new Client({
    environment:
      getEnv().KICKBACK_ENV === "sandbox"
        ? Environment.Sandbox
        : Environment.Production,
    timeout: 15000,
    httpClientOptions: { retryConfig: { maxNumberOfRetries: 0 } },
    clientCredentialsAuthCredentials: {
      oAuthClientId: ctx.clientId,
      oAuthClientSecret: "",
      oAuthToken: {
        accessToken: token.access_token,
        tokenType: "Bearer",
        expiry: BigInt(Math.floor(token.expiresAt / 1000)),
      },
      oAuthTokenProvider: async () => {
        const t = await ctx.client.accessToken("high", deadline);
        return {
          accessToken: t.access_token,
          tokenType: "Bearer",
          expiry: BigInt(Math.floor(t.expiresAt / 1000)),
        };
      },
    },
  });
  try {
    const { result } = await new OrdersController(client).getOrder(
      {
        id,
        ...(ctx.assertionMerchantId
          ? {
              paypalAuthAssertion: authAssertion(
                ctx.clientId,
                ctx.assertionMerchantId,
              ),
            }
          : {}),
      },
      { abortSignal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) },
    );
    return {
      id: result.id,
      status: result.status,
      units: result.purchaseUnits?.map((u) => ({
        amount: u.amount,
        items: u.items?.map((i) => ({
          name: i.name,
          description: i.description,
          url: i.url,
          quantity: i.quantity,
          unitAmount: i.unitAmount,
        })),
        captures: u.payments?.captures?.map((c) => ({
          id: c.id,
          status: c.status,
          amount: c.amount,
        })),
      })),
    };
  } catch (e) {
    if (e instanceof ApiError) throw new OrderLookupError(e.statusCode);
    throw new OrderLookupError(502);
  }
}

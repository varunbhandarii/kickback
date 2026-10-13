import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { connections, merchants, programs } from "@/db/schema";
import { createPayPalClient, getPayPalClient } from "./paypal/client";
import { decryptSecret } from "./crypto/tenant";
import { getEnv } from "./env";
import { loadProgram } from "./engine/program";
const clients = new Map<string, ReturnType<typeof createPayPalClient>>();
export function forgetConnection(merchantId: string) {
  for (const key of clients.keys())
    if (key.startsWith(`${merchantId}:`)) clients.delete(key);
}
export async function loadMerchant(slug: string, includeDisconnected = false) {
  const [merchant] = await getDb()
    .select()
    .from(merchants)
    .where(eq(merchants.slug, slug));
  if (
    !merchant ||
    (["DISCONNECTED", "ONBOARDING"].includes(merchant.status) &&
      !includeDisconnected)
  )
    return undefined;
  let [program] = await getDb()
    .select()
    .from(programs)
    .where(
      and(eq(programs.merchantId, merchant.id), eq(programs.status, "ACTIVE")),
    );
  if (!program && includeDisconnected)
    [program] = await getDb()
      .select()
      .from(programs)
      .where(
        and(eq(programs.merchantId, merchant.id), eq(programs.status, "DRAFT")),
      )
      .orderBy(desc(programs.version))
      .limit(1);
  if (!program) return undefined;
  return { ...merchant, program, spec: loadProgram(program.spec) };
}
export type Merchant = NonNullable<Awaited<ReturnType<typeof loadMerchant>>>;
export async function connectionContext(merchantId: string) {
  const [connection] = await getDb()
    .select()
    .from(connections)
    .where(eq(connections.merchantId, merchantId));
  if (
    !connection ||
    !connection.merchantIdInPayPal ||
    connection.status !== "CONNECTED"
  )
    throw new Error("Merchant connection unavailable");
  const env = getEnv();
  if (connection.mode === "PARTNER")
    return {
      connection,
      client: getPayPalClient(),
      clientId: env.PAYPAL_CLIENT_ID,
      assertionMerchantId: connection.merchantIdInPayPal,
    };
  if (!connection.clientId || !connection.clientSecretEnc)
    throw new Error("Merchant credentials unavailable");
  const key = `${merchantId}:${connection.clientId}:${connection.updatedAt.toISOString()}`;
  if (!clients.has(key))
    clients.set(
      key,
      createPayPalClient({
        clientId: connection.clientId,
        clientSecret: decryptSecret(connection.clientSecretEnc, merchantId),
        environment: env.KICKBACK_ENV,
        bnCode: env.PAYPAL_BN_CODE as string | undefined,
      }),
    );
  return {
    connection,
    client: clients.get(key)!,
    clientId: connection.clientId,
    assertionMerchantId: undefined,
  };
}

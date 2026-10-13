import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { connections } from "@/db/schema";
import { getSession, ownedMerchant } from "@/lib/dal";
import { cookies } from "next/headers";
import { refreshPartnerConnection, SEARCH_SCOPE } from "@/lib/connections";
export async function GET(request: Request) {
  const session = await getSession();
  if (!session)
    return Response.json({ error: "Sign in required" }, { status: 401 });
  const explicit = new URL(request.url).searchParams.get("merchantId"),
    selected = explicit ?? (await cookies()).get("kickback.merchant")?.value;
  const merchant =
    (await ownedMerchant(session.user.id, selected)) ??
    (!explicit ? await ownedMerchant(session.user.id) : undefined);
  if (!merchant)
    return Response.json({ error: "Business not found" }, { status: 404 });
  let [connection] = await getDb()
    .select()
    .from(connections)
    .where(eq(connections.merchantId, merchant.id));
  if (connection?.mode === "PARTNER" && connection.status === "PENDING") {
    try {
      connection = (await refreshPartnerConnection(merchant.id)) ?? connection;
    } catch {
      return Response.json(
        {
          status: "PENDING",
          error: "PayPal verification is temporarily unavailable",
        },
        { status: 503 },
      );
    }
  }
  return Response.json(
    {
      status: connection?.status ?? "NOT_CONNECTED",
      mode: connection?.mode,
      paymentsReceivable: connection?.paymentsReceivable,
      primaryEmailConfirmed: connection?.primaryEmailConfirmed,
      searchEnabled: connection?.scopes.includes(SEARCH_SCOPE) ?? false,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

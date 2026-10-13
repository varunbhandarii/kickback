import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { connections } from "@/db/schema";
import { getSession, ownedMerchant } from "@/lib/dal";
import { refreshPartnerConnection } from "@/lib/connections";
import { getEnv } from "@/lib/env";
export async function GET(request: Request) {
  const base = getEnv().APP_URL,
    session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/sign-in", base));
  const params = new URL(request.url).searchParams,
    tracking = params.get("merchantId");
  if (
    !tracking ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      tracking,
    )
  )
    return NextResponse.redirect(
      new URL("/m/onboarding/connect?state=unconfirmed", base),
    );
  const [connection] = await getDb()
    .select()
    .from(connections)
    .where(eq(connections.trackingId, tracking));
  if (
    !connection ||
    !(await ownedMerchant(session.user.id, connection.merchantId))
  )
    return NextResponse.redirect(
      new URL("/m/onboarding/connect?state=unconfirmed", base),
    );
  let state = "pending";
  try {
    const current = await refreshPartnerConnection(
      connection.merchantId,
      params.get("merchantIdInPayPal") ?? undefined,
    );
    if (current?.status === "CONNECTED") state = "connected";
  } catch {
    /* Re-check can retry without trusting redirect hints. */
  }
  const response = NextResponse.redirect(
    new URL(`/m/onboarding/connect?state=${state}`, base),
  );
  response.cookies.set("kickback.merchant", connection.merchantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(base).protocol === "https:",
    path: "/",
    maxAge: 7 * 86400,
  });
  return response;
}

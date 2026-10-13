import { requireMerchant } from "@/lib/dal";
import { startPartnerConnection } from "@/lib/connections";
import { requireOrigin } from "@/lib/http";
export async function POST(request: Request) {
  const { user, merchant } = await requireMerchant();
  try {
    const denied = requireOrigin(request);
    if (denied) return denied;
    const body = await request.json();
    if (body.consent !== true)
      return Response.json({ error: "Consent required" }, { status: 400 });
    return Response.json({
      actionUrl: await startPartnerConnection(
        user.id,
        merchant.id,
        request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown",
      ),
    });
  } catch {
    return Response.json(
      { error: "PayPal connection could not start" },
      { status: 502 },
    );
  }
}

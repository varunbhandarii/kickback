import { apiError, requireSandboxTools } from "@/lib/http";
import { createReferral } from "@/lib/paypal/referrals";
export async function POST(request: Request) {
  const denied = requireSandboxTools(request);
  if (denied) return denied;
  try {
    const referral = await createReferral();
    return Response.json({ actionUrl: referral.links.find((l) => l.rel === "action_url")?.href });
  } catch (error) { return apiError(error); }
}

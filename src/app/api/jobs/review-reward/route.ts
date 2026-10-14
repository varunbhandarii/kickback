import { z } from "zod";
import { after } from "next/server";
import { validBearer } from "@/lib/http";
import { decideReview } from "@/lib/guard/review";
import { settleReward } from "@/lib/rewards/executor";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!validBearer(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const p = z
        .strictObject({
          merchantId: z.uuid(),
          rewardId: z.uuid(),
          decision: z.enum(["APPROVED", "DECLINED"]),
        })
        .parse(await request.json()),
      result = await decideReview(p.merchantId, p.rewardId, p.decision);
    if (p.decision === "APPROVED")
      after(async () => {
        await settleReward(p.rewardId).catch(() => undefined);
      });
    return Response.json(result);
  } catch {
    return Response.json({ error: "Review unavailable" }, { status: 409 });
  }
}

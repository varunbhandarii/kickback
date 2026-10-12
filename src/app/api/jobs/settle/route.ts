import { z } from "zod";
import { validBearer,apiError } from "@/lib/http";
import { sandboxToolsEnabled } from "@/lib/env";
import { settleReward } from "@/lib/rewards/executor";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!sandboxToolsEnabled()) return Response.json({ error: "Not found" },{ status: 404 });
  if (!validBearer(request)) return Response.json({ error: "Unauthorized" },{ status: 401 });
  try {
    const input = z.object({ id: z.uuid(),mockCode: z.enum(["PENDING_CAPTURE","TRANSACTION_DISPUTED","REFUND_NOT_PERMITTED_DUE_TO_CHARGEBACK","REFUND_AMOUNT_EXCEEDED","CAPTURE_FULLY_REFUNDED","PARTIAL_REFUND_NOT_ALLOWED","MAX_NUMBER_OF_REFUNDS_EXCEEDED","REFUND_TIME_LIMIT_EXCEEDED","REFUND_FAILED_INSUFFICIENT_FUNDS","REFUND_NOT_ALLOWED"]).optional(),interrupt: z.boolean().default(false) }).parse(await request.json());
    return Response.json(await settleReward(input.id,{ mockCode: input.mockCode,interruptAfterResponse: input.interrupt,deadline: Date.now()+25000 }));
  } catch (e) { return apiError(e); }
}

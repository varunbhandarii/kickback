import { z } from "zod";
import { validBearer,apiError } from "@/lib/http";
import { sandboxToolsEnabled } from "@/lib/env";
import { settleReward } from "@/lib/rewards/executor";
import { after } from "next/server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!sandboxToolsEnabled()) return Response.json({ error: "Not found" },{ status: 404 });
  if (!validBearer(request)) return Response.json({ error: "Unauthorized" },{ status: 401 });
  try {
    const input = z.object({ id: z.uuid(),mockCode: z.enum(["PENDING_CAPTURE","TRANSACTION_DISPUTED","REFUND_NOT_PERMITTED_DUE_TO_CHARGEBACK","REFUND_AMOUNT_EXCEEDED","CAPTURE_FULLY_REFUNDED","PARTIAL_REFUND_NOT_ALLOWED","MAX_NUMBER_OF_REFUNDS_EXCEEDED","REFUND_TIME_LIMIT_EXCEEDED","REFUND_FAILED_INSUFFICIENT_FUNDS","REFUND_NOT_ALLOWED"]).optional(),interrupt: z.boolean().default(false),killProcess: z.boolean().default(false) }).refine((value) => !value.killProcess || (value.interrupt && !value.mockCode),"Process interruption requires an accepted real sandbox refund").parse(await request.json());
    const result = await settleReward(input.id,{ mockCode: input.mockCode,interruptAfterResponse: input.interrupt,deadline: Date.now()+25000 });
    if (input.killProcess && "interrupted" in result && result.interrupted) after(() => { console.info(JSON.stringify({ action: "sandbox.web_process_interrupted",reward_id: input.id })); process.kill(process.pid,"SIGKILL"); });
    return Response.json(result);
  } catch (e) { return apiError(e); }
}

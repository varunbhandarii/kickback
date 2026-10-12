import type { Tx } from "@/db";
import { auditLog } from "@/db/schema";
export async function audit(tx: Tx, merchantId: string | null, action: string, subject: string, details: Record<string,unknown> = {}, actor = "system") {
  await tx.insert(auditLog).values({ merchantId, action, subject, details, actor });
}
export function transitionLog(rewardId: string, from: string, to: string, reason?: string, debugId?: string) {
  console.info(JSON.stringify({ reward_id: rewardId, state_from: from, state_to: to, reason, debug_id: debugId }));
}

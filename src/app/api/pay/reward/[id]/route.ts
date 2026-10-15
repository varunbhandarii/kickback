import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { rewards } from "@/db/schema";
import { verifyRewardToken } from "@/lib/crypto/reward-token";
import { allowRequest,clientIp,limited } from "@/lib/rate-limit";
import { rewardNetCents } from "@/lib/rewards/enqueue";
export const runtime = "nodejs";
export async function GET(request: Request,{ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, token = new URL(request.url).searchParams.get("t") ?? "";
  if (token.length > 2048 || !verifyRewardToken(token,id)) return Response.json({ error: "Invalid or expired token" },{ status: 403 });
  if (!allowRequest(`reward:${clientIp(request)}`,120)) return limited();
  const [row] = await getDb().select().from(rewards).where(eq(rewards.id,id));
  return row ? Response.json({ state: row.state,amountCents: rewardNetCents(row),...(row.kind === "WIN_BACK" ? {kind:row.kind} : {}) },{ headers: { "Cache-Control": "no-store" } }) : Response.json({ error: "Not found" },{ status: 404 });
}

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";
import { merchants, connections, programs, customers, visits, rewards, auditLog } from "../src/db/schema";
import { defaultProgram } from "../src/lib/engine/program";
import { claimReward } from "../src/lib/rewards/executor";
if (process.env.KICKBACK_ENV !== "sandbox") throw new Error("This check requires a sandbox database");
process.env.PG_POOL_MAX = "20";
const id = randomUUID(), db = getDb();
try {
  await db.insert(merchants).values({ id,slug: `concurrency-${id}`,displayName: "Concurrency check" });
  const [program] = await db.insert(programs).values({ merchantId: id,version: 1,spec: defaultProgram,status: "ACTIVE" }).returning();
  const ids: string[] = [];
  for (let n = 0; n < 10; n++) {
    const key = `test-${n}`;
    await db.insert(customers).values({ merchantId: id,key,firstSeen: new Date(),lastSeen: new Date() });
    const [visit] = await db.insert(visits).values({ merchantId: id,customerKey: key,startedAt: new Date(),lastCaptureAt: new Date(),amountCents: 550,status: "COMPLETED",source: "REPLAY" }).returning();
    const [reward] = await db.insert(rewards).values({ merchantId: id,customerKey: key,programId: program.id,visitId: visit.id,amountCents: 200,requestId: randomUUID(),note: "Concurrency check" }).returning(); ids.push(reward.id);
  }
  const claimed = (await Promise.all([...ids,...ids].map((rewardId) => claimReward(rewardId)))).filter((row) => row !== undefined);
  if (claimed.length !== 10 || new Set(claimed.map((row) => row.id)).size !== 10) throw new Error("Duplicate or missing claim");
  console.log(JSON.stringify({ ok: true,workers: 20,rewards: 10,claims: claimed.length,uniqueClaims: new Set(claimed.map((row) => row.id)).size }));
} finally {
  await db.transaction(async (tx) => { await tx.delete(auditLog).where(eq(auditLog.merchantId,id)); await tx.delete(rewards).where(eq(rewards.merchantId,id)); await tx.delete(visits).where(eq(visits.merchantId,id)); await tx.delete(customers).where(eq(customers.merchantId,id)); await tx.delete(programs).where(eq(programs.merchantId,id)); await tx.delete(connections).where(eq(connections.merchantId,id)); await tx.delete(merchants).where(eq(merchants.id,id)); });
  await closeDb();
}

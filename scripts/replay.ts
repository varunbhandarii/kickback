import "dotenv/config";
import { parseArgs } from "node:util";
import { replay } from "../src/lib/payments/replay";
import { closeDb } from "../src/db";
const { values } = parseArgs({ options: { merchant: { type: "string",default: "rosas" },count: { type: "string",default: "4" },amount: { type: "string",default: "5.50" },vault: { type: "string" },historical: { type: "boolean",default: false },remote: { type: "string" } } });
try {
  const vaultId = values.vault ?? process.env[`MERCHANT_${values.merchant.toUpperCase()}_VAULT_ID`] ?? process.env.PAYPAL_DEMO_VAULT_ID ?? "";
  const input = { slug: values.merchant,count: Number(values.count),amount: values.amount,vaultId,historical: values.historical };
  if (values.remote) {
    const url = new URL(values.remote); if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("Remote replay requires HTTPS");
    const response = await fetch(new URL("/api/jobs/replay",url),{ method: "POST",headers: { "Content-Type": "application/json",Authorization: `Bearer ${process.env.REMOTE_JOBS_BEARER ?? process.env.JOBS_BEARER}` },body: JSON.stringify(input),signal: AbortSignal.timeout(55000) });
    if (!response.ok) throw new Error(`Remote replay failed (${response.status})`);
    console.log(JSON.stringify(await response.json(),null,2));
  } else console.log(JSON.stringify(await replay({ ...input,deadline: Date.now()+countDeadline(input.count) }),null,2));
} catch (e) { console.error(e instanceof Error ? e.message : "Replay failed"); process.exitCode = 1; } finally { await closeDb(); }
function countDeadline(count: number) { return Math.min(600000,Math.max(45000,count*20000)); }

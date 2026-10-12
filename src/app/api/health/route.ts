import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { getEnv } from "@/lib/env";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const env = getEnv();
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true, env: env.KICKBACK_ENV, db: "ok" });
  } catch {
    return Response.json({ ok: false, env: process.env.KICKBACK_ENV ?? "sandbox", db: "unavailable" }, { status: 503 });
  }
}

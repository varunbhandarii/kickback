import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { rawEvents } from "@/db/schema";
export async function purgeRawEvents() {
  const deleted = await getDb().delete(rawEvents).where(sql`${rawEvents.purgeAfter} < now()`).returning({ id: rawEvents.id });
  return deleted.length;
}

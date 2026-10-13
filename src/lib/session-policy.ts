import { eq } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { session } from "@/db/schema";
import { sessionTooOld } from "./auth-policy";
export async function enforceSessionAge<
  T extends { session: { id: string; createdAt: Date } },
>(
  result: T | null,
  database: Db = getDb(),
  now = Date.now(),
): Promise<T | null> {
  if (result && sessionTooOld(result.session.createdAt, now)) {
    await database.delete(session).where(eq(session.id, result.session.id));
    return null;
  }
  return result;
}

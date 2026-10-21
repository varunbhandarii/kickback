import { eq } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { session } from "@/db/schema";
import { sessionTooOld } from "./auth-policy";
import { DEMO_VIEWER_EMAIL, VIEWER_SESSION_MS } from "./demo/accounts";
export async function enforceSessionAge<
  T extends {
    session: { id: string; createdAt: Date };
    user?: { email?: string | null };
  },
>(
  result: T | null,
  database: Db = getDb(),
  now = Date.now(),
): Promise<T | null> {
  const viewerExpired =
    result?.user?.email === DEMO_VIEWER_EMAIL &&
    now - result.session.createdAt.getTime() >= VIEWER_SESSION_MS;
  if (result && (viewerExpired || sessionTooOld(result.session.createdAt, now))) {
    await database.delete(session).where(eq(session.id, result.session.id));
    return null;
  }
  return result;
}

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Connection = ReturnType<typeof postgres>;
const globalDb = globalThis as unknown as { kickbackSql?: Connection };
export type Db = ReturnType<typeof createDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
let testDb: Db | undefined;
function createDb(connection: Connection) { return drizzle(connection, { schema }); }
export function getDb() {
  if (testDb) return testDb;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  globalDb.kickbackSql ??= postgres(process.env.DATABASE_URL, { max: Math.max(1, Math.min(20, Number(process.env.PG_POOL_MAX ?? 5))), connect_timeout: 10, idle_timeout: 20 });
  return createDb(globalDb.kickbackSql);
}
export function setTestDb(db?: Db) { if (process.env.NODE_ENV !== "test") throw new Error("Test database injection is disabled"); testDb = db; }
export async function closeDb() {
  await globalDb.kickbackSql?.end();
  globalDb.kickbackSql = undefined;
}

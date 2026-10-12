import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let connection: ReturnType<typeof postgres> | undefined;
export function getDb() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  connection ??= postgres(process.env.DATABASE_URL, { max: 5, connect_timeout: 3, idle_timeout: 20 });
  return drizzle(connection, { schema });
}
export async function closeDb() {
  await connection?.end();
  connection = undefined;
}

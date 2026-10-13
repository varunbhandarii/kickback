import "dotenv/config";
import {
  copyFile,
  mkdtemp,
  readFile,
  rm,
  mkdir,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const connection = postgres(process.env.DATABASE_URL, {
  max: 1,
  connect_timeout: 10,
  onnotice: () => undefined,
});
const database = drizzle(connection),
  temporary = await mkdtemp(path.join(os.tmpdir(), "kickback-migrations-"));
try {
  // Keep one session-level lock while committing each migration separately.
  // PostgreSQL requires an added enum value to commit before a later migration
  // can use it in a default, including when starting from an empty database.
  await connection`select pg_advisory_lock(hashtext('kickback:migrations'))`;
  const journal = JSON.parse(
    await readFile("drizzle/meta/_journal.json", "utf8"),
  );
  await mkdir(path.join(temporary, "meta"));
  for (const entry of journal.entries) {
    if (!/^\d{4}_[a-z0-9_]+$/.test(entry.tag))
      throw new Error("Invalid migration name");
    await copyFile(
      path.join("drizzle", `${entry.tag}.sql`),
      path.join(temporary, `${entry.tag}.sql`),
    );
    await writeFile(
      path.join(temporary, "meta", "_journal.json"),
      JSON.stringify({ ...journal, entries: [entry] }),
    );
    await migrate(database, { migrationsFolder: temporary });
  }
  console.info("Database migrations complete");
} finally {
  await connection`select pg_advisory_unlock(hashtext('kickback:migrations'))`.catch(
    () => undefined,
  );
  await connection.end();
  if (path.dirname(temporary) !== path.resolve(os.tmpdir()))
    throw new Error("Unexpected migration temporary directory");
  await rm(temporary, { recursive: true, force: true });
}

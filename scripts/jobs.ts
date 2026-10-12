import "dotenv/config";
import { closeDb } from "../src/db";
import { purgeRawEvents } from "../src/lib/db/purge";
try { console.info(JSON.stringify({ ok: true, deleted: await purgeRawEvents() })); }
catch { console.error("Purge failed"); process.exitCode = 1; }
finally { await closeDb(); }

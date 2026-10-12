import "dotenv/config";
import { seedDemo } from "../src/lib/db/seed-demo";
import { closeDb } from "../src/db";
try { console.info(JSON.stringify(await seedDemo())); }
catch { console.error("Demo seed failed; check merchant configuration"); process.exitCode = 1; }
finally { await closeDb(); }

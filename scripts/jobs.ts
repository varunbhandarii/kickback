import "dotenv/config";
import { closeDb } from "../src/db";
import { runJobs } from "../src/lib/jobs";
try { console.info(JSON.stringify(await runJobs())); }
catch { console.error("Recovery jobs failed"); process.exitCode = 1; }
finally { await closeDb(); }

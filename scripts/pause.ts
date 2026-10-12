import "dotenv/config";
import { pauseAll, pauseMerchant } from "../src/lib/ops";
import { closeDb } from "../src/db";
const action = process.argv[2], slug = process.argv[3];
try { if (!["pause","resume"].includes(action) || !slug) throw new Error("Use pause or resume and a merchant slug (or all)"); const result = slug === "all" ? await pauseAll(action === "pause") : await pauseMerchant(slug,action === "pause"); if (!result) throw new Error("Merchant not found"); console.info(JSON.stringify(result)); }
catch (error) { console.error(error instanceof Error ? error.message : "Pause operation failed"); process.exitCode = 1; }
finally { await closeDb(); }

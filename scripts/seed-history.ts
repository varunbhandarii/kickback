import "dotenv/config";
import { parseArgs } from "node:util";
import { seedHistory } from "../src/lib/demo/history";
import { closeDb } from "../src/db";
const { values } = parseArgs({
  options: {
    merchant: { type: "string" },
    category: { type: "string", default: "cafe" },
    customers: { type: "string", default: "150" },
    days: { type: "string", default: "90" },
    clear: { type: "boolean", default: false },
    seed: { type: "string" },
  },
});
try {
  if (!values.merchant) throw new Error("--merchant required");
  console.log(
    JSON.stringify(
      await seedHistory(
        values.merchant,
        values.category!,
        Number(values.customers),
        Number(values.days),
        values.clear,
        values.seed,
      ),
    ),
  );
} finally {
  await closeDb();
}

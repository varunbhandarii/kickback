import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
if (existsSync(".env")) {
  console.info(".env already exists; existing values were preserved.");
} else {
  const template = readFileSync(".env.example", "utf8")
    .replace(/^KICKBACK_MASTER_KEY=$/m, `KICKBACK_MASTER_KEY=${randomBytes(32).toString("base64")}`)
    .replace(/^JOBS_BEARER=$/m, `JOBS_BEARER=${randomBytes(32).toString("base64url")}`);
  writeFileSync(".env", template, { mode: 0o600 });
  console.info("Created .env with local encryption and job keys. Fill in PayPal credentials before starting the app.");
}

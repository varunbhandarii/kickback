import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
if (existsSync(".env")) {
  let text = readFileSync(".env", "utf8"),
    added = 0;
  for (const [key, value] of Object.entries({
    BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
    DEMO_USER_PASSWORD: randomBytes(18).toString("base64url"),
    DEMO_VIEWER_PASSWORD: randomBytes(24).toString("base64url"),
  })) {
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (!pattern.test(text)) {
      text += `\n${key}=${value}\n`;
      added++;
    } else if (new RegExp(`^${key}=\\s*$`, "m").test(text)) {
      text = text.replace(pattern, `${key}=${value}`);
      added++;
    }
  }
  if (added) writeFileSync(".env", text, { mode: 0o600 });
  console.info(
    "Existing values preserved; missing authentication keys initialized privately.",
  );
} else {
  const template = readFileSync(".env.example", "utf8")
    .replace(
      /^KICKBACK_MASTER_KEY=$/m,
      `KICKBACK_MASTER_KEY=${randomBytes(32).toString("base64")}`,
    )
    .replace(
      /^JOBS_BEARER=$/m,
      `JOBS_BEARER=${randomBytes(32).toString("base64url")}`,
    );
  writeFileSync(
    ".env",
    template
      .replace(
        /^BETTER_AUTH_SECRET=$/m,
        `BETTER_AUTH_SECRET=${randomBytes(32).toString("base64url")}`,
      )
      .replace(
        /^DEMO_USER_PASSWORD=$/m,
        `DEMO_USER_PASSWORD=${randomBytes(18).toString("base64url")}`,
      )
      .replace(
        /^DEMO_VIEWER_PASSWORD=$/m,
        `DEMO_VIEWER_PASSWORD=${randomBytes(24).toString("base64url")}`,
      ),
    { mode: 0o600 },
  );
  console.info(
    "Created .env with local encryption and job keys. Fill in PayPal credentials before starting the app.",
  );
}

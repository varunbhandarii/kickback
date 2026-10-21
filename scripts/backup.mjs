// Encrypted logical backups of the hosted database, kept outside source control.
//   BACKUP_DATABASE_URL=<external URL> BACKUP_PASSPHRASE=<long secret> node scripts/backup.mjs
//   BACKUP_PASSPHRASE=<same secret> node scripts/backup.mjs decrypt <file.enc> <out.dump>
// Restore a decrypted dump with: pg_restore --clean --no-owner -d <database URL> <out.dump>
import { spawnSync } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const DIR = "internal/backups",
  KEEP = 4,
  MAGIC = Buffer.from("KBK1");
const passphrase = process.env.BACKUP_PASSPHRASE;
if (!passphrase || passphrase.length < 20) {
  console.error("Set BACKUP_PASSPHRASE (20+ characters) in the environment.");
  process.exit(1);
}
const key = (salt) => scryptSync(passphrase, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
if (process.argv[2] === "decrypt") {
  const [, , , input, output] = process.argv;
  const data = readFileSync(input);
  if (!data.subarray(0, 4).equals(MAGIC)) throw new Error("Not a Kickback backup");
  const salt = data.subarray(4, 20),
    iv = data.subarray(20, 32),
    tag = data.subarray(32, 48);
  const decipher = createDecipheriv("aes-256-gcm", key(salt), iv);
  decipher.setAuthTag(tag);
  writeFileSync(output, Buffer.concat([decipher.update(data.subarray(48)), decipher.final()]), { mode: 0o600 });
  console.info("Decrypted backup written.");
  process.exit(0);
}
const url = process.env.BACKUP_DATABASE_URL;
if (!url) {
  console.error("Set BACKUP_DATABASE_URL to the database's external connection string.");
  process.exit(1);
}
// A local pg_dump at least as new as the server; Docker's postgres image otherwise.
let dump = spawnSync("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", url], { maxBuffer: 1024 ** 3 });
if (dump.error)
  dump = spawnSync("docker", ["run", "--rm", "postgres:17-alpine", "pg_dump", "--format=custom", "--no-owner", "--no-privileges", url], {
    maxBuffer: 1024 ** 3,
  });
if (dump.status !== 0) {
  console.error("pg_dump failed:", String(dump.stderr).replaceAll(url, "<database>").slice(0, 400));
  process.exit(1);
}
const salt = randomBytes(16),
  iv = randomBytes(12),
  cipher = createCipheriv("aes-256-gcm", key(salt), iv);
const body = Buffer.concat([cipher.update(dump.stdout), cipher.final()]);
mkdirSync(DIR, { recursive: true });
const name = `kickback-${new Date().toISOString().replaceAll(/[:.]/g, "-").slice(0, 19)}.dump.enc`;
writeFileSync(join(DIR, name), Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]), { mode: 0o600 });
const old = readdirSync(DIR)
  .filter((f) => f.endsWith(".dump.enc"))
  .sort()
  .slice(0, -KEEP);
for (const file of old) rmSync(join(DIR, file));
console.info(JSON.stringify({ saved: name, bytes: body.length, removed: old.length }));

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Writes a fresh ingest secret into the .env file.
 *
 * The secret is not something that is fetched from a service, it is a random
 * value the operator owns. This script makes one and puts it in the right
 * place, so there is nothing to remember.
 *
 *   npm run secret          writes it into .env
 *   npm run secret -- --print   only shows it
 */
const printOnly = process.argv.includes("--print");

const secret = crypto.randomBytes(32).toString("hex");

if (printOnly) {
  console.log(secret);
  process.exit(0);
}

const envPath = path.resolve(process.cwd(), ".env");

if (!fs.existsSync(envPath)) {
  console.error(`.env does not exist in ${process.cwd()}. Copy .env.example first.`);
  process.exit(1);
}

const content = fs.readFileSync(envPath, "utf8");
const line = `CODEWARDEN_INGEST_SECRET=${secret}`;

if (/^CODEWARDEN_INGEST_SECRET=.*$/m.test(content)) {
  const updated = content.replace(/^CODEWARDEN_INGEST_SECRET=.*$/m, line);

  fs.writeFileSync(envPath, updated);
} else {
  const separator = content.endsWith("\n") ? "" : "\n";

  fs.writeFileSync(envPath, `${content}${separator}\n${line}\n`);
}

console.log("CODEWARDEN_INGEST_SECRET is written to .env.");
console.log("Restart the API to pick it up.");

// Creates a local .env file with a random demo password for the Kata Payments app.
// Runs automatically after `npm install` / `npm ci` (postinstall), or by hand: npm run setup
// The app, the node:test tests and Cypress all read KATA_PASSWORD from this file.
// .env is in .gitignore: the password never goes into the repository.

import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const FILE = ".env";

if (existsSync(FILE)) {
  console.log(".env already exists, keeping it.");
} else if (process.env.KATA_PASSWORD) {
  console.log("KATA_PASSWORD is already set in the environment, no .env needed.");
} else {
  const password = randomBytes(12).toString("hex");
  writeFileSync(FILE, `# Local demo password for Kata Payments. Never commit this file.\nKATA_PASSWORD=${password}\n`);
  console.log("Created .env with a random KATA_PASSWORD (see the file to sign in by hand).");
}

import { execFileSync } from "node:child_process";
import type { FullConfig } from "@playwright/test";

// Runs once per `playwright test`, after the web servers are up.
//
// Without this, every run leaves its rows behind: each sign-in writes a session
// row that nothing deletes, so the test database grows forever and a spec that
// counts anything would start passing or failing based on how many times the
// suite had been run before. Wiping first makes every run start from the same
// two seeded accounts.
//
// Truncating is guarded server-side on the database name (prisma/truncate.ts),
// so a misconfigured .env cannot point this at the dev database.
export default function globalSetup(config: FullConfig) {
  // `node --env-file` and dotenv both refuse to overwrite a variable that is
  // already set, so an ambient DATABASE_URL — exported in a shell, injected by
  // CI — would win over .env.test and point this whole run at that database.
  // Drop it, so the test env file is the only source.
  const { DATABASE_URL: _ignored, ...env } = process.env;

  const runInServerWorkspace = (script: string) =>
    execFileSync("npm", ["run", "--silent", script, "--workspace", "server"], {
      // Playwright compiles this file to CommonJS, so import.meta is
      // unavailable; rootDir is the directory holding playwright.config.ts.
      cwd: config.rootDir,
      stdio: "inherit",
      env,
    });

  // Migrate first. `migrate deploy` is a no-op when the test database is already
  // current, and without it a new migration turns every spec red with a confusing
  // "column does not exist" instead of "you forgot to migrate".
  runInServerWorkspace("db:migrate:test");
  runInServerWorkspace("db:truncate:test");
  runInServerWorkspace("db:seed:test");
}

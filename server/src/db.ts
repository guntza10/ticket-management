import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy server/.env.example to server/.env and fill it in.",
  );
}

// Under NODE_ENV=test the E2E run wipes whatever this points at, and `--env-file`
// will not overwrite a DATABASE_URL that is already exported — so an ambient
// value silently outranks .env.test. Refuse to start rather than let a test run
// attach to the dev database.
if (
  process.env.NODE_ENV === "test" &&
  !new URL(connectionString).pathname.endsWith("_test")
) {
  throw new Error(
    `NODE_ENV=test but DATABASE_URL points at "${new URL(connectionString).pathname.slice(1)}". ` +
      "A test run may only use a database whose name ends in _test — check for an exported DATABASE_URL.",
  );
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export default prisma;

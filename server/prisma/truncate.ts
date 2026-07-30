import prisma from "../src/db.ts";

// Empties every table so a test run can start from a known state. Seeding is a
// separate step (prisma/seed.ts) — this only deletes.
//
// Guarded on the database name. The only thing standing between this and the
// dev database is which .env file was loaded, and a wrong flag there would
// destroy real work silently, so refuse anything not named *_test.

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set — refusing to truncate.");
}

const database = new URL(url).pathname.slice(1);
if (!database.endsWith("_test")) {
  throw new Error(
    `Refusing to truncate "${database}" — only a database whose name ends in _test may be wiped.`,
  );
}

// Ask Postgres which tables exist rather than listing them here: a hardcoded
// list silently stops covering a model the day someone adds one, and stale rows
// surviving a wipe is the exact failure this script exists to prevent.
// _prisma_migrations is Prisma's own bookkeeping — wiping it would make the next
// `migrate deploy` try to re-apply every migration.
const tables = await prisma.$queryRaw<{ tablename: string }[]>`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
`;

if (tables.length === 0) {
  throw new Error(
    `No tables found in "${database}" — run db:migrate:test before truncating.`,
  );
}

// One statement, so the foreign keys between user/session/account never force a
// delete order. Identifiers come from pg_tables, not from user input.
const quoted = tables.map((t) => `"${t.tablename}"`).join(", ");
await prisma.$executeRawUnsafe(
  `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
);

console.log(`Truncated ${tables.length} tables in ${database}.`);
process.exit(0);

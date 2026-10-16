import type { Role } from "../src/generated/prisma/client.ts";
import prisma from "../src/db.ts";
import {
  createUserSchema,
  createUserWithPassword,
} from "../src/users/create-user.ts";

// Seed accounts from env-provided credentials. Idempotent: an account that
// already exists is left alone, so this is safe to re-run.
//
// The rows themselves are written by createUserWithPassword — the same function
// POST /api/users calls. Sharing it is not tidiness: the two writes have to
// agree on providerId, on accountId matching the user's id, and on the hasher,
// and any disagreement produces an account that is created successfully and can
// never sign in. Two copies of that would drift in silence.

async function seedUser(user: {
  name: string;
  email: string;
  password: string;
  role: Role;
}) {
  // Parse before the existence check, not after. The schema lowercases the
  // address, so an env file with a capital letter would otherwise look past the
  // row it seeded last time and then crash on the unique constraint. It also
  // means a too-short ADMIN_PASSWORD is refused here instead of creating an
  // account that breaks the app's own rule.
  const { name, email, password } = createUserSchema.parse(user);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Already exists (${email}) — skipping.`);
    return;
  }

  await createUserWithPassword({ name, email, password, role: user.role });

  console.log(`Seeded user: ${email} (role=${user.role})`);
}

const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

if (!adminEmail || !adminPassword) {
  throw new Error(
    "ADMIN_EMAIL and ADMIN_PASSWORD must be set (see server/.env.example).",
  );
}

await seedUser({
  name: "Admin",
  email: adminEmail,
  password: adminPassword,
  role: "admin",
});

// Optional second account. The E2E run sets these (see .env.test) because
// role-gating can only be tested from a non-admin session; a dev .env that
// omits them just seeds the admin, as before.
const agentEmail = process.env.AGENT_EMAIL;
const agentPassword = process.env.AGENT_PASSWORD;

if (agentEmail && agentPassword) {
  await seedUser({
    name: "Agent",
    email: agentEmail,
    password: agentPassword,
    role: "agent",
  });
}

process.exit(0);

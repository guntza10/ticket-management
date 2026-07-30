import type { Role } from "../src/generated/prisma/client.ts";
import prisma from "../src/db.ts";
import { auth } from "../src/auth.ts";

// Seed accounts from env-provided credentials. Idempotent: an account that
// already exists is left alone, so this is safe to re-run.
// Works even with public sign-up disabled — it writes the user + credential
// account directly, using Better Auth's own password hasher so /sign-in/email
// verifies correctly.

async function seedUser(user: {
  name: string;
  email: string;
  password: string;
  role: Role;
}) {
  const existing = await prisma.user.findUnique({
    where: { email: user.email },
  });
  if (existing) {
    console.log(`Already exists (${user.email}) — skipping.`);
    return;
  }

  const ctx = await auth.$context;
  const hashedPassword = await ctx.password.hash(user.password);

  const userId = crypto.randomUUID();
  await prisma.user.create({
    data: {
      id: userId,
      name: user.name,
      email: user.email,
      emailVerified: true,
      role: user.role,
    },
  });
  await prisma.account.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      accountId: userId,
      providerId: "credential",
      password: hashedPassword,
    },
  });

  console.log(`Seeded user: ${user.email} (role=${user.role})`);
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

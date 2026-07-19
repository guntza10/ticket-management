import prisma from "../src/db.ts";
import { auth } from "../src/auth.ts";

// Seed the first admin account from env-provided credentials.
// Idempotent: re-running skips if the admin already exists.
// Works even with public sign-up disabled — it writes the user + credential
// account directly, using Better Auth's own password hasher so /sign-in/email
// verifies correctly.

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  throw new Error(
    "ADMIN_EMAIL and ADMIN_PASSWORD must be set (see server/.env.example).",
  );
}

const existing = await prisma.user.findUnique({ where: { email } });
if (existing) {
  console.log(`Admin already exists (${email}) — skipping seed.`);
  process.exit(0);
}

const ctx = await auth.$context;
const hashedPassword = await ctx.password.hash(password);

const userId = crypto.randomUUID();
await prisma.user.create({
  data: {
    id: userId,
    name: "Admin",
    email,
    emailVerified: true,
    role: "admin",
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

console.log(`Seeded admin user: ${email} (role=admin)`);
process.exit(0);

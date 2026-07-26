import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "./db.ts";

// Session cookies are signed with this secret. Without it Better Auth silently
// falls back to a default value published in its own source — and it only
// rejects that default when NODE_ENV=production, which we never set. A known
// secret means forgeable cookie signatures, so refuse to start instead.
const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  throw new Error(
    "BETTER_AUTH_SECRET is not set. Copy server/.env.example to server/.env and fill it in.",
  );
}

// Better Auth instance — email/password with server-side (database) sessions.
// Sessions are stored in the DB by default, so they can be revoked instantly.
// BETTER_AUTH_URL is read from the environment.
export const auth = betterAuth({
  secret,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // The SPA dev server (Vite) runs on a different origin than this API.
  // Better Auth checks the request Origin against this list (CSRF protection)
  // on state-changing calls like sign-in, so the client origin must be trusted.
  trustedOrigins: ["http://localhost:5173"],
  // Internal portal: sign-in stays on, but public self-registration is off.
  emailAndPassword: { enabled: true, disableSignUp: true },
  user: {
    additionalFields: {
      // Mirrors the Prisma `Role` enum on User. input:false means a user can
      // never set their own role — it's assigned by seeding/admin only.
      role: {
        type: ["agent", "admin"],
        required: false,
        defaultValue: "agent",
        input: false,
      },
    },
  },
});

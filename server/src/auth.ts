import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "./db.ts";
import { CLIENT_ORIGIN, RATE_LIMIT_ENABLED } from "./config.ts";

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
  trustedOrigins: [CLIENT_ORIGIN],
  // Better Auth turns the origin check OFF by default when NODE_ENV=test, and
  // that switch also disables the CSRF check. The E2E run sets NODE_ENV=test,
  // so without this the suite would be exercising an app whose CSRF gate is
  // silently removed — and the gate itself could never be tested. Pin it on.
  advanced: { disableOriginCheck: false },
  // Internal portal: sign-in stays on, but public self-registration is off.
  emailAndPassword: { enabled: true, disableSignUp: true },
  // Better Auth's own rate limiter (default when on: 100 requests / 60s, with a
  // stricter rule on the sign-in routes). It exists to blunt credential
  // stuffing, so it stays on in production — see config.ts for why the E2E run
  // is the one place it's off.
  rateLimit: { enabled: RATE_LIMIT_ENABLED },
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

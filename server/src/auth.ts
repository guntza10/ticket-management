import { APIError, BASE_ERROR_CODES, betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
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
  // Both of these refuse a soft-deleted user a new session. A soft delete
  // leaves the `user` row and its credential `account` row untouched, so the
  // password still verifies — without these, deleting someone only logs them
  // out until they type it again.
  //
  // Better Auth does the same two things in its admin plugin's banUser: flag
  // the row, revoke the sessions, refuse the next sign-in. We are not adopting
  // that plugin (it brings its own `role` column, which would collide with the
  // Prisma enum this project hand-manages) — only its shape.
  hooks: {
    // The one that produces a sensible answer. Sign-in's own refusal for a
    // wrong password is APIError.from("UNAUTHORIZED",
    // BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD), and this matches it byte for
    // byte — deliberately, so nobody can learn from the outside whether an
    // address belongs to a deleted account or to no account at all.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email") return;

      const email = (ctx.body as { email?: unknown } | undefined)?.email;
      if (typeof email !== "string") return;

      // Lowercased for the same reason the schema lowercases on the way in:
      // that is the form the address is stored in.
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: { deletedAt: true },
      });

      if (user?.deletedAt) {
        throw APIError.from(
          "UNAUTHORIZED",
          BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD,
        );
      }
    }),
  },
  databaseHooks: {
    session: {
      create: {
        // The backstop. `hooks.before` above is shaped around one route's body,
        // so it covers `/sign-in/email` and nothing else; this sits under every
        // path that could ever create a session. Returning false stops the
        // insert, which sign-in then reports as 401 FAILED_TO_CREATE_SESSION —
        // a worse message, which is exactly why it is second and not first.
        //
        // Costs one findUnique per sign-in. Acceptable: sign-in already hashes
        // a password, which is far more expensive.
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { deletedAt: true },
          });

          if (user?.deletedAt) return false;
        },
      },
    },
  },
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
      // Declared so requireAuth can see it. Better Auth builds `session.user`
      // by walking the fields it knows about, so a column that exists in
      // Postgres but is not named here never reaches the guard — it would read
      // `undefined` and let a deleted user through.
      //
      // It therefore rides along on every get-session answer. That is the
      // caller's own row, so it is not a leak, but it is a public field now.
      // Do not mirror it into inferAdditionalFields on the client unless
      // something there actually reads it.
      deletedAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },
});

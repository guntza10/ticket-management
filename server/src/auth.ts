import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "./db.ts";

// Better Auth instance — email/password with server-side (database) sessions.
// Sessions are stored in the DB by default, so they can be revoked instantly.
// BETTER_AUTH_SECRET and BETTER_AUTH_URL are read from the environment.
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
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

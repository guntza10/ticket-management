import { z } from "zod";
import type { Role } from "../generated/prisma/client.ts";
import prisma from "../db.ts";
import { auth } from "../auth.ts";

// Deliberately duplicated in client/src/components/CreateUserForm.tsx. A shared
// workspace cannot hold this: the server runs Node-native TypeScript with no
// build step, and Node refuses to strip types from anything under node_modules
// — which is exactly where npm symlinks a workspace package. The guard against
// the two copies drifting is the API spec
// "POST /api/users is 400 when the password is shorter than 8 characters":
// change the rule on one side only and that spec goes red.
//
// 8 is also Better Auth's default minPasswordLength, but this path never calls
// its sign-up API, so nothing in the library enforces it for us. The rule is
// restated here on purpose, not inherited.
//
// .toLowerCase() is correctness, not tidiness. /sign-in/email looks a user up
// by email.toLowerCase(), so a row stored with any capital letter could never
// sign in — and because the unique index is case-sensitive, it would sit beside
// the lowercase address as a second row instead of being rejected. Check order
// is load-bearing: zod runs left to right, so z.email() still refuses a
// space-padded address before the transform ever runs, which is the same answer
// /sign-in/email gives.
export const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  email: z.email("Enter a valid email address.").toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

// The same allow-list GET /api/users selects, so both endpoints answer with one
// shape and a spec can assert a single field set for the two of them.
const PUBLIC_USER_FIELDS = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
};

/**
 * Writes the `user` + credential `account` pair Better Auth expects, hashing
 * with Better Auth's own hasher so /sign-in/email can verify it. `input` must
 * already have been through `createUserSchema`.
 *
 * Shared with prisma/seed.ts on purpose. If the two ever drifted on
 * `providerId`, on `accountId` matching the user's id, or on the hasher, the
 * account would still be created successfully and simply never be able to sign
 * in — a failure with no error attached to it.
 */
export async function createUserWithPassword(
  input: CreateUserInput & { role: Role },
) {
  // Read the hasher off the live config instead of importing hashPassword from
  // better-auth/crypto. They are the same function today, but sign-in verifies
  // with whatever `emailAndPassword.password.hash` resolves to — so if that is
  // ever customised, a default-made hash silently stops matching.
  const ctx = await auth.$context;
  const password = await ctx.password.hash(input.password);

  const userId = crypto.randomUUID();

  // One transaction, because a half-written pair is worse than a failure: a
  // user row whose account row never landed occupies the address, can never
  // sign in, and cannot be created again — the retry answers 409 forever.
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        id: userId,
        name: input.name,
        email: input.email,
        // There is no verification email in this app and
        // requireEmailVerification is off, so `false` would mean nothing today
        // and lock these accounts out the day it is turned on.
        emailVerified: true,
        role: input.role,
      },
      select: PUBLIC_USER_FIELDS,
    });

    await tx.account.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        // A credential account's accountId is the user's own id — this is the
        // row shape Better Auth's own sign-up writes.
        accountId: userId,
        providerId: "credential",
        password,
      },
    });

    return user;
  });
}

import type { CreateUserInput } from "../../../core/schemas/users.ts";
import type { Role } from "../generated/prisma/client.ts";
import prisma from "../db.ts";
import { auth } from "../auth.ts";

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

import type { UpdateUserInput } from "../../../core/schemas/users.ts";
import prisma from "../db.ts";
import { auth } from "../auth.ts";
import {
  CREDENTIAL_PROVIDER_ID,
  PUBLIC_USER_FIELDS,
} from "./create-user.ts";

/**
 * Updates a user's profile, and their credential password only when `input`
 * carries one. `input` must already have been through `updateUserSchema`, which
 * is what turns a blank password field into `undefined` — this function reads
 * that absence as "leave the password alone" and nothing else tells it to.
 *
 * Unlike createUserWithPassword, the second write is *conditional*: the profile
 * row is always written, the credential row only when a password came in. Both
 * still share one transaction, so a failed password write rolls the profile
 * back — the caller asked for one change, not half of one.
 *
 * @throws when the row has no credential account, which is a row this app could
 * not have written: createUserWithPassword always writes the pair. The route
 * lets it reach the 500 handler rather than inventing a status for it.
 */
export async function updateUser(id: string, input: UpdateUserInput) {
  // Hashed outside the transaction on purpose. Argon2 is deliberately slow —
  // doing it inside would hold a database connection and the row's lock open
  // for the whole of it, for no benefit, since the hash depends on nothing the
  // transaction reads.
  //
  // Same config-aware hasher as create-user.ts: sign-in verifies with whatever
  // `emailAndPassword.password.hash` resolves to, so a hash made by any other
  // function silently stops matching the day that is customised.
  const password =
    input.password === undefined
      ? undefined
      : await (await auth.$context).password.hash(input.password);

  return prisma.$transaction(async (tx) => {
    // Throws P2025 when no row has this id, which the route turns into a 404.
    // No findUnique first, for the same reason POST does not pre-check the
    // address: a check cannot close the gap between itself and the write, so it
    // buys a round-trip and no correctness.
    const user = await tx.user.update({
      where: { id },
      data: { name: input.name, email: input.email },
      select: PUBLIC_USER_FIELDS,
    });

    if (password !== undefined) {
      // updateMany, not update: `account` has no unique index on
      // (userId, providerId), so Prisma will not let `update` find a row by
      // that pair. The filter still matches at most one row — one credential
      // account per user is what create-user.ts writes.
      const { count } = await tx.account.updateMany({
        where: { userId: id, providerId: CREDENTIAL_PROVIDER_ID },
        data: { password },
      });

      // updateMany answers 0 instead of throwing, so without this a user with
      // no credential account would get a 200 saying the password was changed
      // when nothing was written — and they would then fail to sign in with
      // either password. Throwing rolls the profile update back too, which is
      // right: the caller asked for one change, not half of one.
      if (count === 0) {
        throw new Error(`User ${id} has no credential account to update`);
      }
    }

    return user;
  });
}

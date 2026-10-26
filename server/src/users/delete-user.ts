import { Prisma } from "../generated/prisma/client.ts";
import prisma from "../db.ts";
import { PUBLIC_USER_FIELDS } from "./create-user.ts";

/**
 * The three answers a delete can have. A union rather than thrown errors
 * because only one of them — the missing row — carries a Prisma signal;
 * "this user is an admin" is a rule of ours that no database error describes,
 * and `index.ts`'s error middleware is a last-resort 500, not a mapper.
 */
export type SoftDeleteResult =
  | { status: "deleted"; user: SoftDeletedUser }
  | { status: "not_found" }
  | { status: "is_admin" };

type SoftDeletedUser = Prisma.UserGetPayload<{
  select: typeof PUBLIC_USER_FIELDS;
}>;

/**
 * Stamps `deletedAt` instead of removing the row, and — this is part of the
 * contract, not a side effect — **wipes that user's sessions**, so the cookie
 * they are holding stops resolving immediately. A caller that only wanted a
 * flag set would be surprised; there is no such caller, and there should not
 * be one: a user marked deleted who is still signed in is the exact state this
 * endpoint exists to prevent.
 *
 * Signing back in is refused separately, in `auth.ts` — the row and its
 * credential `account` both survive a soft delete, so the password still
 * verifies unless something says otherwise.
 */
export async function softDeleteUser(id: string): Promise<SoftDeleteResult> {
  try {
    const user = await prisma.$transaction(async (tx) => {
      // The rules live in the `where`, not in a read before it. Prisma allows
      // extra non-unique filters beside a unique one, so the database is what
      // enforces "never an admin" and "don't re-stamp a row that is already
      // deleted" — a check-then-act could be raced between the check and the
      // write, which is the same reasoning that keeps POST on P2002 and PATCH
      // on P2025 instead of a findUnique.
      const updated = await tx.user.update({
        where: { id, role: { not: "admin" }, deletedAt: null },
        data: { deletedAt: new Date() },
        select: PUBLIC_USER_FIELDS,
      });

      // In the transaction on purpose: a row flagged as deleted whose sessions
      // survived is worse than a failed delete, because nothing visible says
      // the person is still signed in.
      //
      // Raw Prisma rather than Better Auth's internalAdapter.deleteUserSessions
      // so it can share this transaction. That is only safe because
      // `cookieCache` is off in auth.ts — turn it on and cached cookies would
      // stay valid past this wipe, and this would have to go through Better
      // Auth instead.
      await tx.session.deleteMany({ where: { userId: id } });

      return updated;
    });

    // A second sweep, after the commit. It narrows — it does not close — the
    // window where a sign-in that passed auth.ts's check just before this
    // transaction began inserts its session row just after the wipe above.
    // `requireAuth` is what actually refuses such a session; see the Known
    // gaps table in the root CLAUDE.md for what is still open.
    //
    // No test can tell these two wipes apart: removing either one on its own
    // leaves `users-api-delete.spec.ts` green, because the other still clears
    // the row. Taking out both is what turns it red. They are kept for
    // different reasons — the one above for atomicity, this one for the race —
    // and neither is dead code just because one spec covers them jointly.
    await prisma.session.deleteMany({ where: { userId: id } });

    return { status: "deleted", user };
  } catch (err) {
    if (
      !(err instanceof Prisma.PrismaClientKnownRequestError) ||
      err.code !== "P2025"
    ) {
      throw err;
    }

    // Purely diagnostic: the write has already been refused, so this read only
    // chooses which answer to give. It can be raced into a wrong *message*,
    // never a wrong write.
    const existing = await prisma.user.findUnique({
      where: { id },
      select: PUBLIC_USER_FIELDS,
    });

    if (!existing) {
      return { status: "not_found" };
    }

    // Admin first: an admin row must always answer "not deletable", whatever
    // else is true of it.
    if (existing.role === "admin") {
      return { status: "is_admin" };
    }

    if (existing.deletedAt !== null) {
      // Already deleted. DELETE is idempotent, and the row is returned with
      // its original timestamp rather than a fresh one — the first deletion is
      // the one that happened.
      return { status: "deleted", user: existing };
    }

    // Deletable right now, yet the update matched nothing. Nothing in the API
    // can produce this: role is not editable and there is no restore. So it is
    // a broken invariant, and it belongs in the 500 handler rather than in a
    // status code that would claim something untrue.
    throw new Error(
      `User ${id} was refused deletion for no discernible reason`,
      { cause: err },
    );
  }
}

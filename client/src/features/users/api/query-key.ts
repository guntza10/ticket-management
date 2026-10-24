/**
 * The cache identity of the user roster: one key, three call sites.
 *
 * `UsersPage` reads with it and both mutations invalidate with it, and the
 * three have to agree or nothing says so — a mutation that names a different
 * key succeeds, the server really does have the new row, and the table simply
 * keeps showing the roster from before. No type catches that, and a component
 * test that fakes the API boundary will not either.
 *
 * `as const` so the array is readonly: it is shared by three modules and none
 * of them has any business pushing to it.
 */
export const USERS_QUERY_KEY = ["users"] as const;

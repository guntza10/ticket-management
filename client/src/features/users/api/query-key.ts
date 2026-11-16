/**
 * Every cache key the user roster owns, in one object.
 *
 * Converted to this shape on 2026-11-14 alongside `features/tickets/api/`, so
 * the project builds a query key one way rather than two. It was a single
 * `USERS_QUERY_KEY = ["users"]` const while this feature had exactly one key;
 * what made that stop being enough is not the roster but the convention — see
 * the matching file in `features/tickets/api/` for the reasoning in full.
 *
 * `all()` and `list()` have different callers and that difference is the whole
 * design: the three mutations invalidate **`all()`**, while `useUsers` reads
 * with **`list()`**. React Query matches by prefix, so invalidating `all()`
 * clears the list — and will clear a `detail(id)` too, the day one exists,
 * without any of the three mutations being touched.
 *
 * They have to agree or nothing says so: a mutation naming a key the reader
 * does not use succeeds, the server really does have the new row, and the table
 * keeps showing the roster from before. No type catches that, and a component
 * test that fakes the API boundary will not either — which is why
 * `CreateUserForm`, `EditUserForm` and `DeleteUserDialog` each assert the key
 * their mutation invalidates, as a **hand-written literal** rather than by
 * importing this file.
 *
 * `as const` so the arrays are readonly: they are shared by four modules and
 * none of them has any business pushing to one.
 */
export const userKeys = {
  all: () => ["users"] as const,
  list: () => [...userKeys.all(), "list"] as const,
};

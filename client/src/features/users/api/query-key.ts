import type { UserListQuery } from "../../../../../core/schemas/users.ts";

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
 *
 * **`list()` takes the query since 2026-11-21, because the server decides which
 * rows a page holds.** Page 2 is a different answer from page 1, so it has to
 * be a different cache entry — one key for both would serve page 1's rows to
 * page 2 until something refetched. The query goes in as **one object element**
 * rather than spread into several: React Query hashes object keys in a stable
 * order, array positions it does not.
 *
 * The three mutations still invalidate `all()` and were not touched, which is
 * the prefix relationship doing its job — every page of the roster is cleared
 * by one call, including pages the admin is not looking at.
 */
export const userKeys = {
  all: () => ["users"] as const,
  list: (query: UserListQuery) => [...userKeys.all(), "list", query] as const,
};

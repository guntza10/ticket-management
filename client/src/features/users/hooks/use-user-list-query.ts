import {
  functionalUpdate,
  type OnChangeFn,
  type PaginationState,
} from "@tanstack/react-table";
import { useSearchParams } from "react-router";
import { PAGE_SIZE } from "../../../../../core/schemas/pagination.ts";
import {
  userListQuerySchema,
  type UserListQuery,
} from "../../../../../core/schemas/users.ts";

/**
 * What the roster asks for when the URL says nothing. Parsed out of the schema
 * rather than written as `{ page: 1 }`, so the client's idea of the first page
 * and the server's are one value.
 */
const DEFAULT_QUERY = userListQuerySchema.parse({});

/**
 * The whole question /users asks the server, which today is only which page —
 * read from the URL and written back to it.
 *
 * **It is the ticket list's hook with the sort and the filters taken out**, and
 * that is deliberate rather than a coincidence worth sharing: `?page=` has to
 * behave the same way on both lists (a refresh keeps the page, the back button
 * goes back one), so the roster gets a hook of its own in the same shape
 * instead of reaching into the tickets feature, which the import rules forbid
 * anyway.
 *
 * What is *not* here is the half that made the other one interesting: no
 * `page: 1` reset, because there is nothing on this page that can narrow the
 * list, and nothing to keep in sync with it.
 *
 * `features/users/hooks/` is created by this file, by the usual rule — the
 * folder exists once something belongs in it.
 */
export function useUserListQuery() {
  const [searchParams, setSearchParams] = useSearchParams();

  // `?? undefined` for the same reason it is on every parameter of the ticket
  // list: zod's `.default()` fires on `undefined` and never on `null`, and
  // `searchParams.get()` answers `null` for a parameter that is not there, so
  // without it every visit to a bare /users would fail the parse. Here that
  // would fall back to page 1 — the same answer — which is exactly why it is
  // worth a comment: this is the one place the mistake would be invisible.
  const parsed = userListQuerySchema.safeParse({
    page: searchParams.get("page") ?? undefined,
  });

  // A hand-typed `?page=0` shows page 1 rather than an error page. The server
  // still refuses it with 400, which is the check that counts; this keeps a
  // mistyped URL from being the only thing on screen. Safe to fail open
  // because the roster is admin-only at the route *and* at the endpoint — the
  // page number is not what decides who may read it.
  const listQuery = parsed.success ? parsed.data : DEFAULT_QUERY;

  /**
   * The page in TanStack's spelling — `pageIndex` counts from 0, `?page=`
   * counts from 1 — so this line and the footer's `+ 1` are the only two
   * places the two meet. `pageSize` is the shared constant, because no control
   * offers a choice.
   */
  const pagination: PaginationState = {
    pageIndex: listQuery.page - 1,
    pageSize: PAGE_SIZE,
  };

  /**
   * Moves to another page. Pushes, so the back button goes back a page.
   *
   * Takes TanStack's updater because the footer calls the table's own
   * `nextPage()` / `lastPage()`, which all route through this one callback.
   * `next.pageSize` is dropped for the same reason as on the ticket list:
   * nothing can change it, and writing one into the URL would ask the endpoint
   * for a page size it does not read.
   */
  const onPaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const next = functionalUpdate(updater, pagination);
    setSearchParams(
      toSearchParams({ ...listQuery, page: next.pageIndex + 1 }),
    );
  };

  return { listQuery, pagination, onPaginationChange };
}

/**
 * The query as a URL, leaving out anything the server would do anyway — so
 * /users stays /users on the first page instead of growing `?page=1`.
 *
 * Takes the whole `UserListQuery` rather than a page number, which costs
 * nothing while the query is one field and is the shape that stopped the ticket
 * list's version from dropping parameters when it grew. Note the honest
 * duplication: this is one line the two hooks both hold, and they would both
 * have to change if `?page=` were ever spelled differently. Keeping one
 * function in `lib/` for a single `params.set` is the trade this repo has
 * already refused twice.
 */
function toSearchParams({ page }: UserListQuery) {
  const params = new URLSearchParams();
  if (page !== DEFAULT_QUERY.page) params.set("page", String(page));
  return params;
}

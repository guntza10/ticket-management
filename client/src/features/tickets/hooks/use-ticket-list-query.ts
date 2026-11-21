import {
  functionalUpdate,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import { useSearchParams } from "react-router";
import { PAGE_SIZE } from "../../../../../core/schemas/pagination.ts";
import {
  ticketListQuerySchema,
  type TicketListQuery,
} from "../../../../../core/schemas/tickets.ts";

/**
 * What the list asks for when the URL says nothing: the order it had before
 * sorting existed, and no filtering at all. Derived from the schema rather than
 * written out again, so the server's defaults and the client's are one value.
 */
const DEFAULT_QUERY = ticketListQuerySchema.parse({});

/** The three parameters that narrow *which* rows, as opposed to their order. */
export type TicketFilters = Pick<
  TicketListQuery,
  "search" | "status" | "category"
>;

/**
 * The shape of `setFilters` below, named so a component's prop list can point
 * at it instead of restating it.
 *
 * `tsc` catches a drift between the two anyway, at the `TicketsPage` call site,
 * so this is for the reader: a second argument is easy to miss in a prop list,
 * and one name sends whoever notices it to the file that explains who decides
 * whether a filter change counts as a navigation.
 */
export type SetTicketFilters = (
  patch: Partial<TicketFilters>,
  options?: { replace?: boolean },
) => void;

/**
 * The whole question this page asks the server — the sort and the three
 * filters — read from the URL and written back to it.
 *
 * It was `useTicketSort` until 2026-11-19. The rename is the point: it owns
 * every parameter of this list now, and a hook called "sort" that silently
 * decides what `?status=` does is a worse name than a longer one.
 *
 * **Why the URL and not state:** a filter is where the person is looking, not a
 * detail of how the page is drawn. In the URL it survives a refresh, the back
 * button undoes it, and the view can be sent to somebody as a link. A store
 * does none of those.
 *
 * Pagination joined it on 2026-11-21 and is the parameter that tests that
 * reasoning hardest, because it is the one the reference project keeps in
 * `useState` instead. Two things fall out of the URL that state cannot give:
 * the fifth page of a search is a link somebody can send, and the back button
 * walks back through the pages rather than leaving the list at page 5 with a
 * history entry per keystroke. What it costs is the rule the two setters above
 * now carry — a filter or a sort change has to write `page: 1` itself, where
 * the reference gets it from a `useEffect` on the filters.
 *
 * It also translates, because the two sides spell a sort differently —
 * TanStack Table wants `[{ id, desc }]` and the API wants
 * `?sortBy=&sortOrder=`. Keeping that in one place means the page below never
 * has to hold both spellings at once.
 */
export function useTicketListQuery() {
  const [searchParams, setSearchParams] = useSearchParams();

  // **`?? undefined` on every parameter, and it is load-bearing.** zod's
  // `.default()` fires on `undefined` and never on `null`, and `.optional()`
  // has the same gap, while `searchParams.get()` answers `null` for a parameter
  // that is not there — so without it a URL carrying only some of these fails
  // the parse and reverts to the unfiltered default.
  //
  // That partial URL is not an edge case: it is what the app itself writes.
  // `toSearchParams` below leaves out whatever matches the default or is
  // absent, so a click on Status writes exactly `?sortBy=status` and typing in
  // the search box writes exactly `?search=…`.
  //
  // **One `??` per parameter is the cost of reading them by name, and
  // forgetting one is not a local fault.** `safeParse` fails as a whole, so a
  // missing `??` takes the *entire* query down with it: every URL that omits
  // that one parameter reverts to the unfiltered default, dropping whichever
  // filters the URL did carry. Measured 2026-11-19 — deleting the one after
  // `status` turns 9 tests red across this hook's file and
  // TicketsPage.test.tsx, and the case naming a parameter is the one that
  // survives its own `??` being cut, because that URL is the one carrying it.
  // The sort half of this was found by mutation testing on 2026-11-14.
  // `safeParse(Object.fromEntries(searchParams))` removes the condition rather
  // than guarding it and was tried on 2026-11-16, then reverted on 2026-11-17
  // by preference: reading each parameter by name is the clearer of the two.
  // Worth knowing before it is proposed again as new, and it also needs
  // `DOM.Iterable` in the client's `lib`, which this repo's `tsc` does not
  // demand only because `@types/node` leaks an iterable `URLSearchParams` into
  // the program.
  //
  // A query string nobody could have produced (`?status=hack`) falls back below
  // rather than travelling to the API to be refused. The server still refuses
  // it, which is the check that counts; this one keeps a mistyped URL from
  // showing an error page when it could show the list.
  //
  // **That fallback is fail-open — an unparseable URL shows every row — and it
  // is safe only because none of these parameters is an authorization
  // boundary.** Both roles may read every ticket by design
  // (`_resources/project/mvp.md`), so "no filter" reveals nothing a caller
  // could not have asked for outright. Raised by `security-reviewer` on
  // 2026-11-19 as the condition to watch rather than a hole: **the day a rule
  // like "an agent sees only the tickets assigned to them" exists, it must not
  // be a parameter here.** It belongs in the `where` the server builds from
  // `res.locals.session`, where no URL can opt out of it — if such a rule ever
  // lived in this query, this very fallback would turn a typo into a way to see
  // everything.
  const parsed = ticketListQuerySchema.safeParse({
    sortBy: searchParams.get("sortBy") ?? undefined,
    sortOrder: searchParams.get("sortOrder") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    page: searchParams.get("page") ?? undefined,
  });
  const listQuery = parsed.success ? parsed.data : DEFAULT_QUERY;

  const sorting: SortingState = [
    { id: listQuery.sortBy, desc: listQuery.sortOrder === "desc" },
  ];

  const onSortingChange: OnChangeFn<SortingState> = (updater) => {
    // TanStack hands over either the next value or a function that computes it
    // from the current one, the same contract a React state setter has.
    // `functionalUpdate` is the library's own name for resolving that pair —
    // written out by hand here until 2026-11-21, in what became five copies
    // across the hooks and their tests.
    const next = functionalUpdate(updater, sorting);
    const [column] = next;
    if (!column) return;

    // Spread over the *current* query, so re-sorting keeps the filters. Before
    // filtering existed this was built from nothing, which was flagged on
    // 2026-11-16 as a landmine with nothing yet to lose; a click on a header
    // would now have cleared the search box and both dropdowns.
    //
    // `column.id` is typed as a plain string by the table, so this is also the
    // one place a column id becomes a TicketSortField — through the same schema
    // the server validates with, rather than a cast.
    const nextQuery = ticketListQuerySchema.safeParse({
      ...listQuery,
      sortBy: column.id,
      sortOrder: column.desc ? "desc" : "asc",
      // Back to the first page, because page 3 of one order is not page 3 of
      // another — the rows that were on it are now scattered through the whole
      // list. Written here and in setFilters rather than in a `useEffect`
      // watching the query: an effect would also fire on the back button, and
      // `?sortBy=status&page=3` is a URL somebody may legitimately return to.
      page: 1,
    });
    if (!nextQuery.success) return;

    setSearchParams(toSearchParams(nextQuery.data));
  };

  /**
   * Narrows the list, keeping everything else the URL already says — including
   * the sort, which is the mirror of the spread above.
   *
   * **`replace` is the caller's call, not this hook's.** A debounced keystroke
   * passes `{ replace: true }`: typing is not a navigation, and without it
   * every pause mid-word leaves a history entry, so leaving a search would take
   * several presses of the back button. Choosing a dropdown value is a
   * navigation and pushes, the same as clicking a header.
   */
  const setFilters: SetTicketFilters = (patch, options) => {
    // `page: 1` last, so it wins over whatever the current query holds. A
    // filter narrows the list, so the page the caller was on may not exist in
    // the narrowed one — searching from page 4 would otherwise land on an
    // empty table with a full toolbar and nothing saying why.
    setSearchParams(
      toSearchParams({ ...listQuery, ...patch, page: 1 }),
      options,
    );
  };

  /**
   * The page half of the query in the table's own spelling, which is not the
   * URL's: TanStack counts `pageIndex` from 0 and `?page=` counts from 1.
   * **The two spellings meet here and in the footer's `+ 1`, nowhere else** —
   * the same arrangement `sorting` above has, where the hook is what turns
   * `?sortBy=&sortOrder=` into `[{ id, desc }]`.
   *
   * `pageSize` is the constant both workspaces import rather than anything
   * from the URL, because no control offers a choice. See
   * `core/schemas/pagination.ts` for why `?pageSize=` is not a parameter and
   * what would make it one.
   */
  const pagination: PaginationState = {
    pageIndex: listQuery.page - 1,
    pageSize: PAGE_SIZE,
  };

  /**
   * Moves to another page of the same question — the only setter here that
   * keeps every other parameter exactly as it was, which is the mirror of the
   * two above forcing `page: 1`.
   *
   * It pushes, like a dropdown and a header: paging through a list is a
   * navigation, and the back button going back a page is what somebody expects
   * from it.
   *
   * It takes TanStack's updater rather than a page number, because the table's
   * own `nextPage()` / `lastPage()` / `setPageIndex()` all route through this
   * one callback — which is the whole reason pagination goes through the
   * instance instead of being wired to buttons by hand.
   *
   * **`next.pageSize` is deliberately dropped.** Nothing can change it: there
   * is no page-size control, and the server slices by the same `PAGE_SIZE`
   * constant. Honouring it here would write a size into the URL that the
   * endpoint does not read, which is a view the server cannot answer. The day
   * a control exists, `?pageSize=` has to arrive in the schema first.
   */
  const onPaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const next = functionalUpdate(updater, pagination);
    setSearchParams(
      toSearchParams({ ...listQuery, page: next.pageIndex + 1 }),
    );
  };

  return {
    listQuery,
    sorting,
    onSortingChange,
    setFilters,
    pagination,
    onPaginationChange,
  };
}

/**
 * The query as a URL, carrying only what differs from what the server would do
 * anyway — so `/tickets` unsorted and unfiltered stays `/tickets` rather than
 * growing a query string that asks for exactly the default.
 *
 * **It takes a whole `TicketListQuery` and rebuilds the string from scratch,
 * which is what makes it safe.** The earlier version started from an empty
 * `URLSearchParams` while being handed only the sort, so every caller had to
 * remember to merge in whatever else the URL held. Rebuilding from a complete
 * query removes the thing to remember: a parameter can only be dropped here by
 * being left out of this function, and that is one place to look. That claim
 * was tested by pagination on 2026-11-21 and held: `?page=` cost exactly one
 * line here, and no caller had to be visited to keep it.
 *
 * Pushed rather than replaced by default: the back button undoing a sort or a
 * filter is one of the reasons they are in the URL at all.
 */
function toSearchParams({
  sortBy,
  sortOrder,
  search,
  status,
  category,
  page,
}: TicketListQuery) {
  const params = new URLSearchParams();
  if (sortBy !== DEFAULT_QUERY.sortBy) params.set("sortBy", sortBy);
  if (sortOrder !== DEFAULT_QUERY.sortOrder) params.set("sortOrder", sortOrder);
  // Truthiness rather than `!== undefined`, so an empty search is written the
  // same way an absent one is. The schema already turns `""` into `undefined`
  // on the way in; this is the matching half on the way out, for a caller that
  // hands over what it read off an input.
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  if (category) params.set("category", category);
  // `!== 1` rather than truthiness, and `String()` because a URL holds text:
  // the first page is what the server answers with no parameter at all, so
  // page 1 must write nothing or every list would carry `?page=1` the moment
  // anybody touched it.
  if (page !== DEFAULT_QUERY.page) params.set("page", String(page));
  return params;
}

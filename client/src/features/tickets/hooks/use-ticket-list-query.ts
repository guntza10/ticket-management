import type { OnChangeFn, SortingState } from "@tanstack/react-table";
import { useSearchParams } from "react-router";
import {
  ticketListQuerySchema,
  type TicketListQuery,
} from "../../../../../core/schemas/tickets.ts";

/**
 * What the list asks for when the URL says nothing: the order it had before
 * sorting existed. Derived from the schema rather than written out again, so
 * the server's default and the client's are one value.
 */
const DEFAULT_QUERY = ticketListQuerySchema.parse({});

/**
 * The sort lives in the URL, not in component state.
 *
 * A sort is where the person is looking, not a detail of how this page is
 * drawn: in the URL it survives a refresh, the back button undoes it, and the
 * view can be sent to somebody as a link. Filtering and pagination arrive next
 * and want the same three things, which is why this hook returns a whole
 * `TicketListQuery` rather than two loose strings.
 *
 * It also translates, because the two sides spell a sort differently —
 * TanStack Table wants `[{ id, desc }]` and the API wants
 * `?sortBy=&sortOrder=`. Keeping that in one place means the page below never
 * has to hold both spellings at once.
 */
export function useTicketSort() {
  const [searchParams, setSearchParams] = useSearchParams();

  // **`?? undefined` on every parameter, and it is load-bearing.** zod's
  // `.default()` fires on `undefined` and never on `null`, while
  // `searchParams.get()` answers `null` for a parameter that is not there — so
  // without it a URL carrying one half of the sort fails the parse and reverts
  // to newest-first. That half-a-sort URL is not an edge case: `toSearchParams`
  // below drops whichever half already matches the default, so a click on Status
  // writes exactly `?sortBy=status`. The test is *"fills in the half of the sort
  // the URL leaves out"*, and it goes red without these two `??` — measured.
  //
  // **The cost is that every parameter added here needs its own.** Filtering and
  // pagination are coming to this URL, and forgetting one reproduces the fault
  // for that parameter alone. `safeParse(Object.fromEntries(searchParams))`
  // removes the condition instead of guarding it — absent keys are simply absent
  // — and was tried on 2026-11-16 and **reverted on 2026-11-17 by preference**,
  // reading each parameter by name being the clearer of the two. Worth knowing
  // before it is suggested again as new: it also needs `DOM.Iterable` in the
  // client's `lib`, which this repo's `tsc` run does not require only because
  // `@types/node` leaks a global iterable `URLSearchParams` into the program.
  //
  // A query string nobody could have produced (`?sortBy=hack`) falls back below
  // rather than travelling to the API to be refused. The server still refuses it,
  // which is the check that counts; this one keeps a mistyped URL from showing an
  // error page when it could show the list.
  const parsed = ticketListQuerySchema.safeParse({
    sortBy: searchParams.get("sortBy") ?? undefined,
    sortOrder: searchParams.get("sortOrder") ?? undefined,
  });
  const listQuery = parsed.success ? parsed.data : DEFAULT_QUERY;

  const sorting: SortingState = [
    { id: listQuery.sortBy, desc: listQuery.sortOrder === "desc" },
  ];

  const onSortingChange: OnChangeFn<SortingState> = (updater) => {
    // TanStack hands over either the next value or a function that computes it
    // from the current one, the same contract a React state setter has.
    const next = typeof updater === "function" ? updater(sorting) : updater;
    const [column] = next;
    if (!column) return;

    // `column.id` is typed as a plain string by the table, so this is the one
    // place a column id becomes a TicketSortField — through the same schema the
    // server validates with, rather than a cast.
    const nextQuery = ticketListQuerySchema.safeParse({
      sortBy: column.id,
      sortOrder: column.desc ? "desc" : "asc",
    });
    if (!nextQuery.success) return;

    setSearchParams(toSearchParams(nextQuery.data));
  };

  return { sorting, onSortingChange, listQuery };
}

/**
 * A sort that already matches the server's default leaves no tail on the URL,
 * so `/tickets` stays `/tickets` instead of carrying a query string that asks
 * for exactly what it would get anyway.
 *
 * Pushed rather than replaced: the back button undoing a sort is one of the
 * reasons the sort is in the URL at all.
 *
 * **It starts from an empty `URLSearchParams`, which is a landmine for the next
 * person to edit it.** Nothing is lost today because the sort is the only thing
 * this URL carries — but the doc comment above promises filters and a page are
 * coming here, and on that day a click on a header would silently drop them.
 * Whoever adds the first filter has to start this from the current
 * `searchParams` and strip the defaults out of that instead. Flagged by
 * `clean-code-reviewer` on 2026-11-16; not fixed now because a fix with nothing
 * to preserve cannot be tested.
 */
function toSearchParams({ sortBy, sortOrder }: TicketListQuery) {
  const params = new URLSearchParams();
  if (sortBy !== DEFAULT_QUERY.sortBy) params.set("sortBy", sortBy);
  if (sortOrder !== DEFAULT_QUERY.sortOrder) params.set("sortOrder", sortOrder);
  return params;
}

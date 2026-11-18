import type { TicketListQuery } from "../../../../../core/schemas/tickets.ts";

/**
 * Every cache key this feature owns, in one object.
 *
 * This is the shape TanStack Query's own docs call a **query factory**, and the
 * grouping is the point rather than tidiness. Two loose exports — a const for
 * the prefix and a function for the list — cannot be discovered from each
 * other: knowing one name tells you nothing about the other, and they end up
 * spelled in two different conventions because one is a const and one is a
 * function. `ticketKeys.` lists all of them.
 *
 * **`list()` spreads `all()` rather than restating `["tickets"]`.** That is what
 * makes the hierarchy real: every key this feature produces starts with what
 * `all()` returns, so a mutation invalidating `ticketKeys.all()` clears every
 * sort and, later, every detail — React Query matches a key by prefix, which its
 * docs spell out (`["todos"]` invalidates `["todos", { page: 1 }]` too).
 *
 * **The `"list"` segment earns its place the day `detail` arrives.** Without it
 * a list key and a detail key are both two elements long —
 * `["tickets", { sortBy }]` against `["tickets", 17]` — which still hash apart
 * but leave no way to invalidate only the lists, and nothing readable in
 * devtools. It is written in now because adding it later changes every cache
 * key in flight.
 *
 * The sort is part of the key because the **server** decides the order: each
 * sort is a different answer and therefore a different entry. The query object
 * goes in as one element rather than spread into several, which is the safer
 * side of the hashing rule — object key order does not affect the hash, array
 * item order does.
 *
 * **Since 2026-11-19 the same object carries the three filters, for the same
 * reason and with nothing here needing to change** — `TicketListQuery` grew and
 * `list()` takes the whole of it. The server decides *which* rows exactly as it
 * decides their order, so each combination of filters is a different answer and
 * a different entry. Written down because the code no longer shows it: a reader
 * seeing only the sort mentioned could "simplify" this to
 * `list({ sortBy, sortOrder })`, which `tsc` would accept and which would then
 * serve one cache entry to two different searches.
 */
export const ticketKeys = {
  all: () => ["tickets"] as const,
  list: (query: TicketListQuery) =>
    [...ticketKeys.all(), "list", query] as const,
};

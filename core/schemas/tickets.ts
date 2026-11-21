import { z } from "zod";
import { pageQuerySchema } from "./pagination.ts";

// What GET /api/tickets may be sorted by. Named once as a value, because zod
// needs a real array to check against at runtime, and once as a type, because
// the server's orderBy map has to be checked at compile time.
//
// `as const` is what makes the second half possible. Without it this array's
// type is `string[]`, TicketSortField below collapses to `string`, and the
// Record keyed by it in tickets.routes.ts stops requiring anything at all.
//
// Every entry here is a scalar column on Ticket. Sorting by the assignee's name
// is a relation hop rather than a column name, so it gets decided the day that
// column exists on the table.
//
// Still not exported: the only reader is `z.enum` three lines below, and the
// type is what travels. This comment used to guess that "a filter dropdown
// built from it" would be the first outside reader. Filtering arrived on
// 2026-11-19 and the guess was wrong — the dropdowns filter by status and
// category, which are values a ticket *has*, not columns it can be ordered by.
// Those two needed exporting (below); this one still has no second reader.
const TICKET_SORT_FIELDS = [
  "subject",
  "senderName",
  "status",
  "category",
  "createdAt",
] as const;

export type TicketSortField = (typeof TICKET_SORT_FIELDS)[number];

// The two Postgres enums on Ticket, mirrored from server/prisma/schema.prisma.
//
// **Exported as arrays, because two readers need the list as a value**, not
// just as a type: `z.enum` below, and the two filter dropdowns in
// `client/src/features/tickets/components/TicketsFilters.tsx`, which build one
// option per member. A dropdown built from a hand-written array beside this one
// is a third copy of the same list.
//
// They live here rather than on the client (where they were hand-written until
// 2026-11-19) because the query schema below validates against them on both
// sides, which is the same rule that earned this file its place in core/. That
// removes one of the two TypeScript copies; **it does not link either one to
// `schema.prisma`**, and nothing does. Add a member to the Postgres enum,
// migrate, forget this file, and no type anywhere goes red — the ticket just
// renders as an empty badge. Recorded in the root CLAUDE.md's Known gaps.
//
// Note what must NOT be done to close that: core/ may not import Prisma's
// generated client, because the client workspace cannot load it.
//
// Member order is the declaration order in the Postgres enum, which is also the
// order `?sortBy=status` returns rows in — a native enum sorts by declaration,
// not alphabetically.
export const TICKET_STATUSES = ["open", "resolved", "closed"] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_CATEGORIES = [
  "general_question",
  "technical_question",
  "refund_request",
] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

// The longest search term the list endpoint will accept. 998 is RFC 5322's
// header-line limit, which `server/src/tickets/inbound-email.routes.ts` already
// uses to cap `subject` and `fromName` — so this is the length of the longest
// subject the app can store, and a term longer than that cannot match anything.
// Named here rather than written inline so the two ceilings can be compared;
// they are the same number for the same reason, not by coincidence.
//
// **Exported, because the search input needs it too.** Capping only here would
// let the client write a URL its own parse then refuses: the box would hold the
// text, the URL would carry it, and the list would quietly show every row with
// nothing on screen saying why. `maxLength` on the input closes that by making
// the URL unwritable rather than by handling the failure.
export const SEARCH_MAX_LENGTH = 998;

// Read by both workspaces, which is the whole reason it is in core/ rather than
// beside the route: the server parses `req.query` with it, and the client parses
// the URL's search params with it before building a request. One definition
// means a filter or a sort the client would ask for is one the server would
// accept, and a hand-typed `?status=whatever` falls back to showing the list in
// the browser instead of travelling to the API to be refused.
//
// The sort defaults are the order the list already had, so a request with no
// query string answers exactly what it answered before this file existed. The
// three filters have no defaults at all: absent means "do not filter", which is
// not a value the caller could have sent instead.
//
// .default() fires on `undefined` only, never on `null` — which matters on the
// client, because URLSearchParams.get() returns null for a parameter that is
// not there. `.optional()` has the same gap. See use-ticket-list-query.ts for
// the one line per parameter that bridges it.
//
// **`page` comes from `pageQuerySchema` by `.extend`, not from a line here**,
// because `?page=` means the same thing on this list and on the roster — see
// `./pagination.ts`. Note what that pairs it with: a page number is the one
// parameter whose correct value depends on the others. Page 3 of a search for
// "refund" is not page 3 of the unfiltered list, so every control that changes
// a filter or the sort has to send the caller back to page 1. The server cannot
// do that for them — it is handed one query and answers it — so the rule lives
// in `use-ticket-list-query.ts`, where the URL is written.
export const ticketListQuerySchema = pageQuerySchema.extend({
  sortBy: z.enum(TICKET_SORT_FIELDS).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  // `?search=` is "not filtering", not a bad value, so it cannot answer 400 —
  // the empty string becomes `undefined` the same way an untouched password
  // field does in core/schemas/users.ts, and on the client JSON/axios then drop
  // the key entirely.
  //
  // .trim() first, so a search of only spaces is also "not filtering" rather
  // than a LIKE pattern that matches every row with a space in it. The trim
  // runs before .max() too, so trailing spaces cannot push a legal term over.
  //
  // **Capped, and the number is borrowed rather than invented.** 998 is the
  // same SEARCH_MAX_LENGTH-shaped ceiling `inbound-email.routes.ts` puts on
  // `subject` and `fromName` — RFC 5322's header-line limit — and the argument
  // carries across: a term longer than the longest subject the app will ever
  // store cannot match anything, so nothing legitimate is refused. Raised by
  // `security-reviewer` on 2026-11-19: without it the only ceiling was Node's
  // ~16 KiB request line, which is a limit the app got by accident rather than
  // by rule, and every character of it costs three `ILIKE '%…%'` scans over an
  // unpaginated table with no usable index.
  //
  // It is a `.max()` and therefore a 400, unlike the empty string above, and
  // that asymmetry is deliberate: "" is a thing a caller legitimately means,
  // a 2 KB search term is not.
  search: z
    .string()
    .trim()
    .max(SEARCH_MAX_LENGTH, "Search term is too long")
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  category: z.enum(TICKET_CATEGORIES).optional(),
});

export type TicketListQuery = z.infer<typeof ticketListQuerySchema>;

import { Router } from "express";
import prisma from "../db.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { requireAuth } from "../require-auth.ts";
import {
  ticketListQuerySchema,
  type TicketSortField,
} from "../../../core/schemas/tickets.ts";

// Mounted at /api/tickets by index.ts, so the one path below is relative to
// that. A second router file in src/tickets/ rather than a second route inside
// inbound-email.routes.ts: same resource, but a different URL and a different
// question at the door — "is there a session?" here, "do you know the shared
// secret?" there. One `router.use` cannot ask both, and a file holding two
// guards is a file where a new route inherits the wrong one.
const router = Router();

// requireAuth alone, and the absence of requireAdmin is the decision.
// /api/users is admin-only because managing accounts is an admin's job;
// working tickets is what an agent is for (_resources/project/mvp.md: "Agent —
// can view and manage tickets"), and an admin can do everything an agent can.
// So this is the first route in the app behind requireAuth by itself.
//
// On the router rather than on the route, the shape users.routes.ts uses: the
// mistake that actually ships is a route added later without the guard.
// requireAdmin is deliberately not imported here, so nobody can add it by
// accepting an autocomplete suggestion.
router.use(requireAuth);

// The list's own allow-list, narrower than PUBLIC_TICKET_FIELDS in
// inbound-email.routes.ts, and the narrowing is the point rather than an
// oversight. Two things decide what belongs here:
//
//   1. A field earns its place by having a *reader*, not by having a column.
//      `id` is drawn nowhere and stays, because the row's React key reads it
//      and the detail page's link will. `assignedToId` has no reader at all
//      today — the table shows no Assigned column, since nothing can assign.
//   2. The costs of guessing wrong are not symmetric. Too narrow and `tsc`
//      fails on the client the moment something reads a field that is not
//      there. Too wide and nothing complains, ever — the field just travels to
//      every browser, and once shipped it is a contract someone may depend on.
//
// `body` and `bodyHtml` fail (1) and would be expensive under (2): a list
// renders neither, and `bodyHtml` is stored unsanitised (see the Known gaps
// table in the root CLAUDE.md). One fewer consumer of that column is strictly
// better than one more. `updatedAt` and `subjectNormalized` stay out too, which
// is also what gives the spec's sorted-key-set assertion teeth.
//
// NOT shared with the webhook's constant, and that does not contradict the
// "one exported constant every verb imports" rule for PUBLIC_USER_FIELDS: that
// rule exists to stop hand-kept copies of *the same* list from drifting, and
// all four /api/users verbs answer the same shape. A list and a detail answer
// different shapes on purpose, so one constant would be the bug. Each lives in
// the file that is its only reader. Move both into src/tickets/ticket-fields.ts
// (and rename PUBLIC_TICKET_FIELDS in the same go) the day GET /api/tickets/:id
// wants the full shape — that is a genuine second reader across files, and it
// is the trigger, not a line count.
//
// Not exported: e2e/tickets-api.spec.ts hand-writes the field list it asserts,
// because a spec that read the value under test could never notice the server
// reading the wrong one.
//
// Two other lists have to stay a subset of this one, and nothing enforces
// either: TICKET_SORT_FIELDS in core/schemas/tickets.ts, and the columns
// searchFilter below matches on. Order rows by, or search in, a column this
// select refuses to return and the column leaks anyway — which rows come back
// tells the caller what the hidden value holds. **Narrowing this list is the
// move that breaks that**, so check both before removing a field.
const TICKET_LIST_FIELDS = {
  id: true,
  subject: true,
  status: true,
  category: true,
  senderName: true,
  senderEmail: true,
  createdAt: true,
};

// One entry per sortable column, rather than the shorter `{ [sortBy]: order }`.
// A computed key type-checks against anything, so a field added to
// TICKET_SORT_FIELDS and forgotten here would reach Prisma as a key the model
// does not have — at runtime, from a request. Keyed by the union instead, `tsc`
// names the member that is missing.
//
// A function per column rather than a plain object because `category` needs a
// shape the others do not — see below. It would also be where a sort over a
// relation goes, but that is not why it is written this way.
//
// `category` is the one nullable column in the list, and Postgres puts nulls
// last on ASC but first on DESC. Sorting categories descending would therefore
// open with every ticket nobody has classified yet, which reads as a fault
// rather than as a sort. `nulls: "last"` pins them to the bottom either way.
const ORDER_BY: Record<
  TicketSortField,
  (direction: Prisma.SortOrder) => Prisma.TicketOrderByWithRelationInput
> = {
  subject: (direction) => ({ subject: direction }),
  senderName: (direction) => ({ senderName: direction }),
  status: (direction) => ({ status: direction }),
  category: (direction) => ({ category: { sort: direction, nulls: "last" } }),
  createdAt: (direction) => ({ createdAt: direction }),
};

// Postgres LIKE and ILIKE read `%` and `_` as wildcards, and **Prisma does not
// escape them for you.** Its own docs say so about the new query API — "you
// write the `%` wildcards yourself" — and `contains` on this client behaves the
// same way about the *value*: it wraps the string in `%…%` and passes whatever
// is inside through untouched.
//
// So this runs over every search term before it reaches `contains`. Two things
// it buys, and only the first is why it is here:
//
//   1. A search for `50%` means `50%`. Unescaped, the `%` matches any run of
//      characters, so it also returns "50 cents" and "5000 units" — a wrong
//      answer with nothing to show the person why.
//   2. It is what makes `mode: "insensitive"` safe to use at all here. The
//      repo's rule (server/CLAUDE.md → Tickets (inbound email)) was written
//      after `Re: %` turned the webhook's duplicate guard into a way to read
//      any open ticket; escaping is the half of the answer that applies when
//      the pattern is genuinely a search box rather than an identity check.
//
// The backslash has to be in the class and replaced too, or `\%` typed by hand
// would escape the escape. One pass over the three characters does that: `$&`
// is the matched character, so `\` → `\\`, `%` → `\%`, `_` → `\_`.
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

// Which columns a search term is matched against: the subject, and both halves
// of who wrote in. Every one of them is in TICKET_LIST_FIELDS above, and that
// is a rule rather than a coincidence — filtering on a column the answer
// refuses to return leaks it, because the set of rows that match tells you what
// the hidden value contains. Check that list before adding a field here.
//
// `mode: "insensitive"` on all three, which is only defensible because of
// escapeLike above: searching for "ANA" has to find "Ana Ruiz", and senderName
// is the one column of the three with no lower-cased copy stored beside it.
function searchFilter(needle: string): Prisma.TicketWhereInput[] {
  const contains = { contains: escapeLike(needle), mode: "insensitive" } as const;
  return [
    { subject: contains },
    { senderName: contains },
    { senderEmail: contains },
  ];
}

// The caller picks a column and a direction; the server still decides the order
// of rows. Two places deciding one order is how they come to disagree, and the
// server is the one that can still be right once this list is paginated — a
// client sorting what it was sent can only ever sort the page it can see.
//
// Filtering follows the same split: the caller says which rows it wants, the
// server decides what that means in SQL. All three filters are optional and
// combine with AND, because each one narrows a different question — a status, a
// category, and some text. `undefined` is how Prisma itself spells "no filter",
// so an absent parameter needs no condition around it; `OR` is the exception,
// since an empty array would match nothing instead of everything.
//
// An unknown column, direction, status or category is a 400 rather than a
// silent fall back to the default, matching what a body does: zod refuses a
// value outside an enum, and `POST /api/users` answers `invalid_body`.
// Defaulting quietly would let a client ship a typo for months and read it as
// working. `?search=` is the one exception and it is not an exception to that
// rule: an empty search is "not filtering", which is a thing the caller can
// legitimately mean, so the schema turns it into `undefined` rather than
// refusing it.
//
// `id` is a second sort key on *every* answer, not a tiebreaker added where one
// looked necessary. `status` and `category` hold three values each, so sorting
// by them leaves large groups whose internal order Postgres never promises:
// the same request can return the same rows in a different order twice. That is
// a deliberate change to this endpoint's contract, and the comment in
// e2e/tickets-api.spec.ts that warned against making it has been updated rather
// than ignored.
//
// Still nothing indexes any of these columns. That decision and its trigger
// live on the Ticket model in schema.prisma, which is the file somebody adding
// an index will open.
//
// No try/catch: there is no Prisma error here that should change the response,
// and Express 5 forwards a rejection to the error handler in index.ts on its
// own.
router.get("/", async (req, res) => {
  const parsed = ticketListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_query" });
    return;
  }
  const { sortBy, sortOrder, search, status, category } = parsed.data;

  const tickets = await prisma.ticket.findMany({
    where: {
      // Written as plain properties rather than conditional spreads: Prisma
      // reads `undefined` as "this filter was not asked for", which is exactly
      // what an absent query parameter means.
      status,
      category,
      OR: search ? searchFilter(search) : undefined,
    },
    select: TICKET_LIST_FIELDS,
    orderBy: [ORDER_BY[sortBy](sortOrder), { id: "desc" }],
  });
  res.json({ tickets });
});

export default router;

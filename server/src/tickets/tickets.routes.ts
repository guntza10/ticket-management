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

// The caller picks a column and a direction; the server still decides the order
// of rows. Two places deciding one order is how they come to disagree, and the
// server is the one that can still be right once this list is paginated — a
// client sorting what it was sent can only ever sort the page it can see.
//
// An unknown column or direction is a 400 rather than a silent fall back to the
// default, matching what a body does: zod refuses a value outside an enum, and
// `POST /api/users` answers `invalid_body`. Defaulting quietly would let a
// client ship a typo for months and read it as working.
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
  const { sortBy, sortOrder } = parsed.data;

  const tickets = await prisma.ticket.findMany({
    select: TICKET_LIST_FIELDS,
    orderBy: [ORDER_BY[sortBy](sortOrder), { id: "desc" }],
  });
  res.json({ tickets });
});

export default router;

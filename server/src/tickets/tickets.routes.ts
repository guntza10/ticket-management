import { Router } from "express";
import prisma from "../db.ts";
import { requireAuth } from "../require-auth.ts";

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

// Newest first, decided by the server rather than the client: two places
// deciding one order is how they come to disagree, and the server is the one
// that can still be right once this list is paginated.
//
// No query parameters at all. Sorting, filtering, search and pagination are
// later units; a parameter nothing sends is a contract with no reader, and it
// would need its own validation and its own specs to mean anything.
//
// Nothing indexes createdAt, deliberately. That decision and its trigger live
// on the Ticket model in schema.prisma, which is the file somebody adding an
// index will open.
//
// No try/catch: there is no Prisma error here that should change the response,
// and Express 5 forwards a rejection to the error handler in index.ts on its
// own.
router.get("/", async (_req, res) => {
  const tickets = await prisma.ticket.findMany({
    select: TICKET_LIST_FIELDS,
    orderBy: { createdAt: "desc" },
  });
  res.json({ tickets });
});

export default router;

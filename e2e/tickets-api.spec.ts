import { test, expect, type APIRequestContext } from "@playwright/test";
import { ADMIN, AGENT, API_URL, signInViaApi } from "./support/auth";
import {
  newInboundEmail,
  sendEmailExpectingNewTicket,
} from "./support/inbound-email";

const TICKETS_URL = `${API_URL}/api/tickets`;

/**
 * Exactly the fields `GET /api/tickets` selects, hand-written and sorted — not
 * `Object.keys(TICKET_LIST_FIELDS)`, because a spec that read the value under
 * test could never notice the server reading the wrong one. That constant is
 * not exported for the same reason.
 *
 * What is *absent* here is the point. `body` and `bodyHtml` are in the
 * webhook's answer (`ALLOWED_TICKET_FIELDS` in support/inbound-email.ts) and
 * deliberately not in this one: a list renders neither, and `bodyHtml` is
 * stored unsanitised. This array is the only thing stopping someone
 * "simplifying" the route into reusing the webhook's wider constant.
 * `assignedToId` and `updatedAt` are out too.
 */
const ALLOWED_TICKET_LIST_FIELDS = [
  "category",
  "createdAt",
  "id",
  "senderEmail",
  "senderName",
  "status",
  "subject",
];

async function readTicketList(request: APIRequestContext) {
  const response = await request.get(TICKETS_URL);

  // Asserted here so a failure lands on the line that broke rather than later
  // on a confusing `undefined`.
  expect(response.status()).toBe(200);
  const { tickets } = (await response.json()) as {
    tickets: Record<string, unknown>[];
  };

  return tickets;
}

test.describe("Tickets API — who may read the list", () => {
  test("GET /api/tickets is 401 without a session", async ({ request }) => {
    const response = await request.get(TICKETS_URL);

    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
  });

  // The test that pins the feature's central authorization decision. /api/users
  // answers an agent 403 because managing accounts is an admin's job; working
  // tickets is what an agent is *for*, so this is the first route in the app
  // behind requireAuth alone. Add requireAdmin to the router and only this
  // test and the one below notice.
  test("GET /api/tickets answers an agent session", async ({ request }) => {
    const email = newInboundEmail("agent-reads");
    const created = await sendEmailExpectingNewTicket(request, email);

    await signInViaApi(request, AGENT);
    const tickets = await readTicketList(request);

    // Identity by id, never by position or count: five workers share one
    // database that is truncated once per run, so every other spec's tickets
    // are in this answer too.
    expect(tickets.map((ticket) => ticket.id)).toContain(created.id);
  });

  test("GET /api/tickets answers an admin session", async ({ request }) => {
    const email = newInboundEmail("admin-reads");
    const created = await sendEmailExpectingNewTicket(request, email);

    await signInViaApi(request, ADMIN);
    const tickets = await readTicketList(request);

    expect(tickets.map((ticket) => ticket.id)).toContain(created.id);
  });
});

test.describe("Tickets API — what the list returns", () => {
  test("every row carries the list's fields and nothing else", async ({
    request,
  }) => {
    const email = newInboundEmail("field-set");
    await sendEmailExpectingNewTicket(request, email);

    await signInViaApi(request, AGENT);
    const tickets = await readTicketList(request);

    // Every row, not a sample: the allow-list has to hold for all of them.
    for (const ticket of tickets) {
      expect(Object.keys(ticket).sort()).toEqual(ALLOWED_TICKET_LIST_FIELDS);
    }
  });

  // Spelled out separately from the key-set loop above, because this is the
  // rule a reader of the route needs to know and a sorted-array comparison
  // does not say it out loud: the customer's message never travels to a page
  // that does not render it.
  test("no row carries the email body", async ({ request }) => {
    const email = newInboundEmail("no-body");
    await sendEmailExpectingNewTicket(request, email);

    await signInViaApi(request, AGENT);
    const tickets = await readTicketList(request);

    for (const ticket of tickets) {
      expect(ticket).not.toHaveProperty("body");
      expect(ticket).not.toHaveProperty("bodyHtml");
    }
  });

  // The ordering the page depends on, proven the only way this suite allows:
  // relative position of two tickets this test created itself. `tickets[0]`
  // would be another worker's row half the time, and a length assertion would
  // be wrong from the first parallel run.
  //
  // The two POSTs are awaited in turn, so they are milliseconds apart and
  // `createdAt` separates them. `orderBy` has no tiebreaker, so if this ever
  // flakes the answer is to read the failure first — adding `id` as a secondary
  // sort would be a change to the endpoint's contract, not a test fix.
  test("lists a newer ticket before an older one", async ({ request }) => {
    const older = await sendEmailExpectingNewTicket(
      request,
      newInboundEmail("older"),
    );
    const newer = await sendEmailExpectingNewTicket(
      request,
      newInboundEmail("newer"),
    );

    await signInViaApi(request, AGENT);
    const ids = (await readTicketList(request)).map((ticket) => ticket.id);

    expect(ids).toContain(older.id);
    expect(ids).toContain(newer.id);
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
  });
});

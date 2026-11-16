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

async function readTicketList(
  request: APIRequestContext,
  params?: Record<string, string>,
) {
  const response = await request.get(TICKETS_URL, params && { params });

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
  // `createdAt` separates them anyway. Since 2026-11-13 the endpoint also sorts
  // by `id` descending behind whichever column was asked for, so two rows
  // written inside the same millisecond still come back newest-first. That was
  // a deliberate change to this endpoint's contract — this comment used to warn
  // against making it, because sorting by `status` or `category` leaves groups
  // of three values whose internal order Postgres never promised.
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

test.describe("Tickets API — sorting the list", () => {
  // Two tickets whose subjects bracket every other row in the database. Sorting
  // is a property of the whole table and five workers are writing to it, so the
  // only assertable claim is where these two sit relative to each other — the
  // same rule every other ticket spec follows.
  async function createBracketingSubjects(request: APIRequestContext) {
    const run = crypto.randomUUID();
    const first = await sendEmailExpectingNewTicket(request, {
      ...newInboundEmail("sort-subject-a"),
      subject: `AAA sorting ${run}`,
    });
    const last = await sendEmailExpectingNewTicket(request, {
      ...newInboundEmail("sort-subject-z"),
      subject: `ZZZ sorting ${run}`,
    });

    return { first, last };
  }

  test("sorts by subject ascending when asked", async ({ request }) => {
    const { first, last } = await createBracketingSubjects(request);

    await signInViaApi(request, AGENT);
    const ids = (
      await readTicketList(request, { sortBy: "subject", sortOrder: "asc" })
    ).map((ticket) => ticket.id);

    expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(last.id));
  });

  // The same two rows read the other way round. Without this, a route that
  // ignored `sortOrder` entirely and always sorted ascending would pass the
  // test above.
  test("sorts by subject descending when asked", async ({ request }) => {
    const { first, last } = await createBracketingSubjects(request);

    await signInViaApi(request, AGENT);
    const ids = (
      await readTicketList(request, { sortBy: "subject", sortOrder: "desc" })
    ).map((ticket) => ticket.id);

    expect(ids.indexOf(last.id)).toBeLessThan(ids.indexOf(first.id));
  });

  // Sender is two columns in one table cell — the name above, the address
  // below — and only `senderName` is sortable. This is the test that would go
  // red if ORDER_BY reached for `senderEmail` instead.
  test("sorts by sender name, not sender address", async ({ request }) => {
    const run = crypto.randomUUID();
    const first = await sendEmailExpectingNewTicket(request, {
      ...newInboundEmail("sort-sender-a"),
      fromName: `AAA Sender ${run}`,
      from: `zzz-${run}@test.local`,
    });
    const last = await sendEmailExpectingNewTicket(request, {
      ...newInboundEmail("sort-sender-z"),
      fromName: `ZZZ Sender ${run}`,
      from: `aaa-${run}@test.local`,
    });

    await signInViaApi(request, AGENT);
    const ids = (
      await readTicketList(request, { sortBy: "senderName", sortOrder: "asc" })
    ).map((ticket) => ticket.id);

    expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(last.id));
  });

  test("sorts by createdAt ascending when asked", async ({ request }) => {
    const older = await sendEmailExpectingNewTicket(
      request,
      newInboundEmail("sort-oldest"),
    );
    const newer = await sendEmailExpectingNewTicket(
      request,
      newInboundEmail("sort-newest"),
    );

    await signInViaApi(request, AGENT);
    const ids = (
      await readTicketList(request, { sortBy: "createdAt", sortOrder: "asc" })
    ).map((ticket) => ticket.id);

    expect(ids.indexOf(older.id)).toBeLessThan(ids.indexOf(newer.id));
  });

  // `status` and `category` are accepted sort columns, and that is *all* these
  // two prove. The webhook is the only way a spec can create a ticket and it
  // always writes `open` with no category, so every row this suite can make
  // sorts identically — the order itself only becomes assertable when
  // PATCH /api/tickets/:id arrives. Drop either name from TICKET_SORT_FIELDS
  // and the matching test goes red on a 400, which is worth having.
  for (const sortBy of ["status", "category"]) {
    test(`accepts ${sortBy} as a sort column`, async ({ request }) => {
      await sendEmailExpectingNewTicket(request, newInboundEmail(`sort-${sortBy}`));

      await signInViaApi(request, AGENT);
      const tickets = await readTicketList(request, { sortBy, sortOrder: "asc" });

      for (const ticket of tickets) {
        expect(Object.keys(ticket).sort()).toEqual(ALLOWED_TICKET_LIST_FIELDS);
      }
    });
  }

  // Sorting must not widen what a row carries. The allow-list and the order by
  // are two lines of the same Prisma call, and the easiest way to "add sorting"
  // wrongly is to rewrite that call from scratch and lose the select.
  test("a sorted answer carries the same fields as an unsorted one", async ({
    request,
  }) => {
    await sendEmailExpectingNewTicket(request, newInboundEmail("sorted-fields"));

    await signInViaApi(request, AGENT);
    const tickets = await readTicketList(request, {
      sortBy: "subject",
      sortOrder: "asc",
    });

    for (const ticket of tickets) {
      expect(Object.keys(ticket).sort()).toEqual(ALLOWED_TICKET_LIST_FIELDS);
    }
  });
});

test.describe("Tickets API — what the list refuses", () => {
  // A column outside the allow-list is refused rather than quietly replaced by
  // the default. Defaulting would let a client ship `?sortBy=createdat` and
  // read a list that looks right for months.
  test("refuses a column it does not sort by", async ({ request }) => {
    await signInViaApi(request, AGENT);
    const response = await request.get(TICKETS_URL, {
      params: { sortBy: "bodyHtml" },
    });

    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_query" });
  });

  test("refuses a direction that is not asc or desc", async ({ request }) => {
    await signInViaApi(request, AGENT);
    const response = await request.get(TICKETS_URL, {
      params: { sortBy: "subject", sortOrder: "sideways" },
    });

    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_query" });
  });

  // 401 before 400: the guard is on the router, so a caller with no session
  // never learns whether its query string was valid.
  test("asks for a session before it reads the query", async ({ request }) => {
    const response = await request.get(TICKETS_URL, {
      params: { sortBy: "bogus" },
    });

    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
  });
});

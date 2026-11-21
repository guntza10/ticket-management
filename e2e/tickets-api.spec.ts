import { test, expect, type APIRequestContext } from "@playwright/test";
import { ADMIN, AGENT, signInViaApi } from "./support/auth";
import {
  newInboundEmail,
  sendEmailExpectingNewTicket,
} from "./support/inbound-email";
// Moved to support/ on 2026-11-19, when tickets-api-filter.spec.ts became a
// second caller. The allow-list is still hand-written there rather than read
// off the server's own constant.
import {
  ALLOWED_TICKET_LIST_FIELDS,
  readAllTickets,
  TICKETS_URL,
} from "./support/tickets";

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
    const tickets = await readAllTickets(request);

    // Identity by id, never by position or count: five workers share one
    // database that is truncated once per run, so every other spec's tickets
    // are in this answer too.
    expect(tickets.map((ticket) => ticket.id)).toContain(created.id);
  });

  test("GET /api/tickets answers an admin session", async ({ request }) => {
    const email = newInboundEmail("admin-reads");
    const created = await sendEmailExpectingNewTicket(request, email);

    await signInViaApi(request, ADMIN);
    const tickets = await readAllTickets(request);

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
    const tickets = await readAllTickets(request);

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
    const tickets = await readAllTickets(request);

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
    const ids = (await readAllTickets(request)).map((ticket) => ticket.id);

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
    // The token goes into both subjects, and since 2026-11-21 it is also what
    // the reads below filter by — see the comment on each.
    const run = crypto.randomUUID();
    const first = await sendEmailExpectingNewTicket(request, {
      ...newInboundEmail("sort-subject-a"),
      subject: `AAA sorting ${run}`,
    });
    const last = await sendEmailExpectingNewTicket(request, {
      ...newInboundEmail("sort-subject-z"),
      subject: `ZZZ sorting ${run}`,
    });

    return { first, last, run };
  }

  // **Filtered by this test's own token, and that is load-bearing since the list
  // was paginated (2026-11-21).** `readAllTickets` pages through the whole
  // answer, and its own note explains that a concurrent insert can duplicate a
  // row but not hide one — which is true of the *default* order and false here:
  // another worker's ticket can sort *between* two rows already collected and
  // push an unread row backwards over a page boundary, so it is never read.
  // `indexOf` then answers `-1`, and `-1 < 4` is true, so the test would pass
  // while proving nothing. `search` narrows the answer to the two rows this
  // test created, which is one page and cannot straddle anything.
  //
  // The `toContain` pair in front of the comparison is the second half of that:
  // it is what tells "sorted the wrong way" apart from "row never arrived".
  test("sorts by subject ascending when asked", async ({ request }) => {
    const { first, last, run } = await createBracketingSubjects(request);

    await signInViaApi(request, AGENT);
    const ids = (
      await readAllTickets(request, {
        sortBy: "subject",
        sortOrder: "asc",
        search: run,
      })
    ).map((ticket) => ticket.id);

    expect(ids).toContain(first.id);
    expect(ids).toContain(last.id);
    expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(last.id));
  });

  // The same two rows read the other way round. Without this, a route that
  // ignored `sortOrder` entirely and always sorted ascending would pass the
  // test above.
  test("sorts by subject descending when asked", async ({ request }) => {
    const { first, last, run } = await createBracketingSubjects(request);

    await signInViaApi(request, AGENT);
    const ids = (
      await readAllTickets(request, {
        sortBy: "subject",
        sortOrder: "desc",
        search: run,
      })
    ).map((ticket) => ticket.id);

    expect(ids).toContain(first.id);
    expect(ids).toContain(last.id);
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
    // Narrowed by the run token like the two subject tests above, and it works
    // here for free: `?search=` matches senderName as well as the subject, and
    // the token is in both sender names.
    const ids = (
      await readAllTickets(request, {
        sortBy: "senderName",
        sortOrder: "asc",
        search: run,
      })
    ).map((ticket) => ticket.id);

    expect(ids).toContain(first.id);
    expect(ids).toContain(last.id);
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
      await readAllTickets(request, { sortBy: "createdAt", sortOrder: "asc" })
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
      const tickets = await readAllTickets(request, { sortBy, sortOrder: "asc" });

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
    const tickets = await readAllTickets(request, {
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

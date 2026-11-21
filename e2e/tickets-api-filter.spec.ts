import { test, expect } from "@playwright/test";
import { AGENT, signInViaApi } from "./support/auth";
import {
  newInboundEmail,
  sendEmailExpectingNewTicket,
} from "./support/inbound-email";
import {
  ALLOWED_TICKET_LIST_FIELDS,
  createTicketWithSubject,
  newSearchToken,
  readTicketIds,
  readAllTickets,
  TICKETS_URL,
} from "./support/tickets";

/**
 * `?search=`, `?status=` and `?category=` on `GET /api/tickets`.
 *
 * **Every spec here identifies its rows by a token no other worker could
 * produce**, for the reason `support/inbound-email.ts` spells out: five workers
 * share one `ticket_management_test` database that is truncated once per run,
 * so every row any spec inserts is visible to every other. A filter is a
 * property of the whole table, so the only assertable claims are "this row I
 * created is in the answer" and "this one is not" — never a count, never a
 * position.
 *
 * A UUID is also what makes the negative assertions sharp: searching for a
 * fresh token can legitimately be expected to answer *nothing*, which a route
 * ignoring `?search=` fails immediately.
 */
/**
 * The three categories, hand-written rather than imported from
 * `core/schemas/tickets.ts` — the same rule ALLOWED_TICKET_LIST_FIELDS follows.
 * The enum is part of what these specs test, and a spec that read the value
 * under test could not notice the server reading the wrong one.
 */
const CATEGORIES = [
  "general_question",
  "technical_question",
  "refund_request",
];

test.describe("Tickets API — filtering by status", () => {
  // The webhook writes `status: open` and nothing in the app can change it
  // yet, so "a ticket is returned when its status matches" is the only
  // positive case reachable from here.
  test("returns a ticket whose status matches", async ({ request }) => {
    const ticket = await sendEmailExpectingNewTicket(
      request,
      newInboundEmail("filter-status-open"),
    );

    await signInViaApi(request, AGENT);

    expect(await readTicketIds(request, { status: "open" })).toContain(
      ticket.id,
    );
  });

  // **This is the test with teeth.** The one above passes against a route that
  // ignores `?status=` entirely, because every row in the database is open.
  // Asking for a status the ticket does not have is what proves the WHERE is
  // there at all.
  //
  // It is also why `resolved` and `closed` have no positive case: no endpoint
  // can move a ticket out of `open`, and these specs reach the database only
  // over HTTP. That arrives with `PATCH /api/tickets/:id`.
  test("leaves out a ticket whose status does not match", async ({
    request,
  }) => {
    const ticket = await sendEmailExpectingNewTicket(
      request,
      newInboundEmail("filter-status-resolved"),
    );

    await signInViaApi(request, AGENT);

    expect(await readTicketIds(request, { status: "resolved" })).not.toContain(
      ticket.id,
    );
    expect(await readTicketIds(request, { status: "closed" })).not.toContain(
      ticket.id,
    );
  });
});

test.describe("Tickets API — filtering by category", () => {
  // Same shape and the same limit, one notch tighter: an inbound email always
  // lands uncategorised (a classifier fills it in a later phase), so there is
  // no row in the test database with a category at all. The positive direction
  // is therefore unprovable here rather than untested — asserting "every
  // returned row is a general_question" against an empty answer would pass
  // whatever the route did.
  //
  // What *is* provable is that asking for a category does not hand back the
  // uncategorised rows, which is the mistake a missing filter makes.
  test("leaves out a ticket that has no category", async ({ request }) => {
    const ticket = await sendEmailExpectingNewTicket(
      request,
      newInboundEmail("filter-category"),
    );

    await signInViaApi(request, AGENT);

    // Read in parallel rather than in a loop of awaits: three independent GETs
    // that nothing orders, and oxlint's no-await-in-loop is right about it.
    const answers = await Promise.all(
      CATEGORIES.map((category) => readTicketIds(request, { category })),
    );

    for (const ids of answers) {
      expect(ids).not.toContain(ticket.id);
    }
  });
});

test.describe("Tickets API — searching the list", () => {
  test("finds a ticket by a word in its subject", async ({ request }) => {
    const token = newSearchToken();
    const ticket = await createTicketWithSubject(
      request,
      "search-subject",
      `Printer jam ${token}`,
    );

    await signInViaApi(request, AGENT);

    expect(await readTicketIds(request, { search: token })).toEqual([
      ticket.id,
    ]);
  });

  test("finds a ticket by its sender's name", async ({ request }) => {
    const token = newSearchToken();
    const ticket = await sendEmailExpectingNewTicket(request, {
      ...newInboundEmail("search-sender-name"),
      fromName: `Ana ${token}`,
    });

    await signInViaApi(request, AGENT);

    expect(await readTicketIds(request, { search: token })).toEqual([
      ticket.id,
    ]);
  });

  // The third column, and the one a search box would be useless without: the
  // list shows the address under the name, so a person reading it will type it.
  test("finds a ticket by its sender's address", async ({ request }) => {
    const token = newSearchToken();
    const ticket = await sendEmailExpectingNewTicket(request, {
      ...newInboundEmail("search-sender-email"),
      from: `${token}@test.local`,
    });

    await signInViaApi(request, AGENT);

    expect(await readTicketIds(request, { search: token })).toEqual([
      ticket.id,
    ]);
  });

  // One test over all three columns. Be precise about what that buys: the three
  // conditions in `searchFilter` share one `contains` object, so a mutation
  // that removes `mode: "insensitive"` from a single column is not expressible
  // — this proves the flag is there, not that it is there three times.
  // Measured: deleting it fails exactly this test and nothing else.
  //
  // A UUID is lower-case hex, so upper-casing it is a genuinely different byte
  // string rather than the same one.
  test("ignores case in all three columns", async ({ request }) => {
    const token = newSearchToken();
    const inSubject = await createTicketWithSubject(
      request,
      "case-subject",
      `Shouting ${token}`,
    );
    const inName = await sendEmailExpectingNewTicket(request, {
      ...newInboundEmail("case-name"),
      fromName: `Bea ${token}`,
    });
    const inEmail = await sendEmailExpectingNewTicket(request, {
      ...newInboundEmail("case-email"),
      from: `${token}@test.local`,
    });

    await signInViaApi(request, AGENT);
    const ids = await readTicketIds(request, {
      search: token.toUpperCase(),
    });

    expect(ids).toContain(inSubject.id);
    expect(ids).toContain(inName.id);
    expect(ids).toContain(inEmail.id);
  });

  // The sharpest shape available at this layer: a term nothing can match has
  // to answer an empty list. A route that accepted `?search=` and ignored it
  // would answer every ticket in the database here.
  test("answers nothing when the term matches no ticket", async ({
    request,
  }) => {
    await sendEmailExpectingNewTicket(request, newInboundEmail("search-miss"));

    await signInViaApi(request, AGENT);

    expect(await readTicketIds(request, { search: newSearchToken() })).toEqual([]);
  });
});

/**
 * Postgres LIKE/ILIKE reads `%` and `_` as wildcards and Prisma passes the
 * value through untouched, so `escapeLike` in `tickets.routes.ts` is the only
 * thing making a search term mean itself.
 *
 * Each test here pairs a ticket that contains the characters literally with a
 * control ticket that the *unescaped* pattern would also match. Delete the
 * escaping and the control row appears in the answer — which is the failure,
 * not a near miss. One test per character because the regex can be written
 * wrong one character at a time: `/[%_]/g` leaves the backslash live, and the
 * backslash is the one that then disarms the other two.
 */
test.describe("Tickets API — wildcards in a search term", () => {
  test("treats % as a literal percent sign", async ({ request }) => {
    const token = newSearchToken();
    const literal = await createTicketWithSubject(
      request,
      "wildcard-percent",
      `${token} 50% off`,
    );
    // Unescaped, `%50% off%` reads as "50", then anything, then " off" — which
    // this subject satisfies.
    const control = await createTicketWithSubject(
      request,
      "wildcard-percent-control",
      `${token} 5000 off`,
    );

    await signInViaApi(request, AGENT);
    const ids = await readTicketIds(request, { search: "50% off" });

    expect(ids).toContain(literal.id);
    expect(ids).not.toContain(control.id);
  });

  test("treats _ as a literal underscore", async ({ request }) => {
    const token = newSearchToken();
    const literal = await createTicketWithSubject(
      request,
      "wildcard-underscore",
      `${token} a_b`,
    );
    // Unescaped, `_` matches exactly one character of any kind.
    const control = await createTicketWithSubject(
      request,
      "wildcard-underscore-control",
      `${token} axb`,
    );

    await signInViaApi(request, AGENT);
    const ids = await readTicketIds(request, { search: "a_b" });

    expect(ids).toContain(literal.id);
    expect(ids).not.toContain(control.id);
  });

  // The backslash is LIKE's own escape character, so an unescaped one does not
  // over-match — it *under*-matches, by escaping the character after it. Both
  // assertions below invert together, which is what makes this test about the
  // backslash rather than a weaker copy of the two above.
  test("treats a backslash as a literal backslash", async ({ request }) => {
    const token = newSearchToken();
    const literal = await createTicketWithSubject(
      request,
      "wildcard-backslash",
      `${token} a\\b`,
    );
    // Unescaped, the pattern `a\b` means a literal "b" after an "a" — so this
    // row matches and the one above does not.
    const control = await createTicketWithSubject(
      request,
      "wildcard-backslash-control",
      `${token} ab`,
    );

    await signInViaApi(request, AGENT);
    const ids = await readTicketIds(request, { search: "a\\b" });

    expect(ids).toContain(literal.id);
    expect(ids).not.toContain(control.id);
  });
});

test.describe("Tickets API — filters combine", () => {
  // Each filter narrows a different question, so they have to AND rather than
  // OR. A route that OR-ed them would answer this ticket for the second call,
  // because the search half still matches.
  test("narrows by search and status together", async ({ request }) => {
    const token = newSearchToken();
    const ticket = await createTicketWithSubject(
      request,
      "combine",
      `Combined ${token}`,
    );

    await signInViaApi(request, AGENT);

    expect(
      await readTicketIds(request, { search: token, status: "open" }),
    ).toEqual([ticket.id]);
    expect(
      await readTicketIds(request, { search: token, status: "resolved" }),
    ).toEqual([]);
  });
});

test.describe("Tickets API — what filtering refuses and accepts", () => {
  const OUTSIDE_THE_ENUM = [
    { parameter: "status", value: "pending" },
    { parameter: "category", value: "billing" },
  ];

  for (const { parameter, value } of OUTSIDE_THE_ENUM) {
    test(`refuses a ${parameter} outside the enum`, async ({ request }) => {
      await signInViaApi(request, AGENT);
      const response = await request.get(TICKETS_URL, {
        params: { [parameter]: value },
      });

      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_query" });
    });
  }

  // `?search=` is not a bad value, it is the absence of one — the schema turns
  // it into `undefined` the same way an untouched password field becomes
  // undefined in core/schemas/users.ts. Refusing it would 400 the moment
  // somebody clears the search box, and `.trim()` is what makes the
  // spaces-only case behave the same instead of matching every row with a
  // space in it.
  // `label` is separate from `name` because newInboundEmail() builds the sender
  // address out of it, so a label with a space in it makes an invalid email and
  // the webhook answers 400 before the test reaches its own assertion.
  const BLANK_SEARCHES = [
    { name: "an empty search", label: "blank-empty", search: "" },
    { name: "a search of only spaces", label: "blank-spaces", search: "   " },
  ];

  for (const { name, label, search } of BLANK_SEARCHES) {
    test(`treats ${name} as no search at all`, async ({ request }) => {
      const ticket = await sendEmailExpectingNewTicket(
        request,
        newInboundEmail(label),
      );

      await signInViaApi(request, AGENT);

      expect(await readTicketIds(request, { search })).toContain(ticket.id);
    });
  }

  // The cap exists so the only ceiling is not Node's ~16 KiB request line, which
  // the app would be relying on by accident. 998 is the longest subject the
  // webhook will store, so the first refused length is one past anything that
  // could have matched.
  //
  // Both halves, because a cap that refuses the legal length is the more likely
  // mistake: an off-by-one in the `.max()` fails the first assertion, a missing
  // `.max()` fails the second.
  test("takes a search at the length limit and refuses one past it", async ({
    request,
  }) => {
    await signInViaApi(request, AGENT);

    const atLimit = await request.get(TICKETS_URL, {
      params: { search: "a".repeat(998) },
    });
    expect(atLimit.status()).toBe(200);

    const pastLimit = await request.get(TICKETS_URL, {
      params: { search: "a".repeat(999) },
    });
    expect(pastLimit.status()).toBe(400);
    expect(await pastLimit.json()).toEqual({ error: "invalid_query" });
  });

  // Filtering must not widen what a row carries. The WHERE and the select are
  // two lines of the same Prisma call, and the easiest way to "add filtering"
  // wrongly is to rewrite that call and lose the allow-list.
  test("a filtered answer carries the same fields as an unfiltered one", async ({
    request,
  }) => {
    const token = newSearchToken();
    await createTicketWithSubject(request, "filter-fields", `Fields ${token}`);

    await signInViaApi(request, AGENT);
    const tickets = await readAllTickets(request, {
      search: token,
      status: "open",
    });

    expect(tickets).toHaveLength(1);
    for (const ticket of tickets) {
      expect(Object.keys(ticket).sort()).toEqual(ALLOWED_TICKET_LIST_FIELDS);
    }
  });
});

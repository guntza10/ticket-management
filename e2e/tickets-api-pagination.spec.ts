import { test, expect, type APIRequestContext } from "@playwright/test";
import { AGENT, signInViaApi } from "./support/auth";
import {
  ALLOWED_TICKET_LIST_FIELDS,
  createTicketWithSubject,
  newSearchToken,
  readTicketPage,
  TICKETS_URL,
} from "./support/tickets";

// How many rows one page holds. **Hand-written, not imported from
// `core/schemas/pagination.ts`**, for the same reason
// `ALLOWED_TICKET_LIST_FIELDS` is hand-written: a spec that read the value
// under test could never notice the server reading the wrong one. Change
// PAGE_SIZE there and these tests fail until somebody comes and agrees to the
// new number, which is the point.
const PAGE_SIZE = 10;

/** One more than a page, so there is a second page with exactly one row on it. */
const TICKET_COUNT = PAGE_SIZE + 1;

/**
 * Eleven tickets whose subjects all carry one token nobody else holds.
 *
 * **The token is what makes counting legal here.** Five workers share one
 * `ticket_management_test` database that `globalSetup` truncates once per run,
 * so the rule everywhere else in this suite is "never assert a length, a count
 * or a position". `?search=<uuid>` narrows the list to rows this file created,
 * and inside that set the exact numbers are the only thing worth asserting —
 * "ten rows on page one, one on page two" is the whole feature.
 *
 * The subjects are numbered with a leading zero (`01` … `11`) so a sort by
 * subject is a sort by number. Without the padding `10` sorts before `2` and
 * the "sorts before it slices" test below would be asserting the wrong order
 * for the wrong reason.
 *
 * Created one at a time rather than with `Promise.all`: `createdAt` decides the
 * default order, and eleven tickets posted at once can share a millisecond,
 * which would make the default-order assertions depend on the `id` tiebreaker
 * instead of on time.
 */
async function createNumberedTickets(request: APIRequestContext) {
  const token = newSearchToken();
  const created = [];

  for (let number = 1; number <= TICKET_COUNT; number += 1) {
    const padded = String(number).padStart(2, "0");
    // Sequential on purpose: `createdAt` decides the default order and these
    // eleven rows have to be distinguishable by it, which `Promise.all` would
    // give up — eleven posts landing in one millisecond leave the order to the
    // `id` tiebreaker instead of to time.
    // eslint-disable-next-line no-await-in-loop
    const ticket = await createTicketWithSubject(
      request,
      `pagination-${padded}`,
      `${token} ticket ${padded}`,
    );
    created.push(ticket);
  }

  return { token, created };
}

// Built once for the whole file rather than per test: eleven webhook posts is
// the most expensive setup in this suite, and every test below asks a different
// question about the same eleven rows. `mode: "serial"` is what makes that
// safe — the config is `fullyParallel`, which otherwise spreads the tests of
// one file across workers, and module scope is per worker.
test.describe.configure({ mode: "serial" });

let createdRows: Promise<{ token: string; created: { id: number }[] }> | undefined;

function numberedTickets(request: APIRequestContext) {
  createdRows ??= createNumberedTickets(request);
  return createdRows;
}

test.describe("Tickets API — pagination", () => {
  test("answers one page of rows and the count of the whole set", async ({
    request,
  }) => {
    const { token } = await numberedTickets(request);

    await signInViaApi(request, AGENT);
    const { tickets, total } = await readTicketPage(request, {
      search: token,
    });

    expect(tickets).toHaveLength(PAGE_SIZE);
    // The count is of every row matching the filter, not of the page — which
    // is the only reason the client can draw "Page 1 of 2".
    expect(total).toBe(TICKET_COUNT);
  });

  test("page two holds the rows page one left out", async ({ request }) => {
    const { token, created } = await numberedTickets(request);

    await signInViaApi(request, AGENT);
    const first = await readTicketPage(request, { search: token, page: "1" });
    const second = await readTicketPage(request, { search: token, page: "2" });

    const firstIds = first.tickets.map((ticket) => ticket.id);
    const secondIds = second.tickets.map((ticket) => ticket.id);

    // No row on both pages, and no row missing from both: the two assertions
    // together are what "paging" means. A `skip` that was off by one would
    // satisfy neither.
    expect(secondIds).toHaveLength(1);
    expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([]);
    expect([...firstIds, ...secondIds].sort()).toEqual(
      created.map((ticket) => ticket.id).sort(),
    );
    expect(second.total).toBe(TICKET_COUNT);
  });

  test("sorts the whole set before it slices a page off it", async ({
    request,
  }) => {
    const { token } = await numberedTickets(request);

    await signInViaApi(request, AGENT);
    const first = await readTicketPage(request, {
      search: token,
      sortBy: "subject",
      sortOrder: "asc",
      page: "1",
    });
    const second = await readTicketPage(request, {
      search: token,
      sortBy: "subject",
      sortOrder: "asc",
      page: "2",
    });

    // Ticket 11 is last by subject, so it is the only row on page two. A server
    // that sliced ten rows out of the table and *then* sorted them would put
    // some other number here — which is the mistake this test exists for, and
    // it is not a hypothetical one: it is exactly what a client-side sort over
    // a paginated list does.
    expect(first.tickets.map((ticket) => ticket.subject)).toEqual(
      Array.from(
        { length: PAGE_SIZE },
        (_, index) => `${token} ticket ${String(index + 1).padStart(2, "0")}`,
      ),
    );
    expect(second.tickets.map((ticket) => ticket.subject)).toEqual([
      `${token} ticket ${TICKET_COUNT}`,
    ]);
  });

  test("answers a page past the end with no rows and the same count", async ({
    request,
  }) => {
    const { token } = await numberedTickets(request);

    await signInViaApi(request, AGENT);
    const { tickets, total } = await readTicketPage(request, {
      search: token,
      page: "3",
    });

    // Not a 404 and not a clamp back to the last page: an honest empty list
    // with an honest total is what lets the footer say "No rows on page 3"
    // while still offering Previous.
    expect(tickets).toEqual([]);
    expect(total).toBe(TICKET_COUNT);
  });

  test("every row on a later page carries the list's fields and nothing else", async ({
    request,
  }) => {
    const { token } = await numberedTickets(request);

    await signInViaApi(request, AGENT);
    const { tickets } = await readTicketPage(request, {
      search: token,
      page: "2",
    });

    // The allow-list is asserted on page *two* on purpose. `skip`/`take` are
    // arguments to the same `findMany` as the `select`, so a second query
    // written for a later page — or a `select` dropped while adding one — would
    // show up here and nowhere else.
    expect(tickets).not.toHaveLength(0);
    for (const ticket of tickets) {
      expect(Object.keys(ticket).sort()).toEqual(ALLOWED_TICKET_LIST_FIELDS);
    }
  });

  test("counts the filtered set rather than the table", async ({ request }) => {
    const { token } = await numberedTickets(request);
    // A twelfth ticket the token does **not** match, so this file can prove the
    // difference on its own. The first version of this test leaned on the other
    // specs' rows being in the same database and failed the moment the file was
    // run by itself — which is also the rule e2e/README.md states: a spec may
    // depend on what it created and on the seed, never on another spec.
    await createTicketWithSubject(
      request,
      "pagination-outsider",
      `outsider ${newSearchToken()}`,
    );

    await signInViaApi(request, AGENT);
    const filtered = await readTicketPage(request, { search: token });
    const everything = await readTicketPage(request);

    // An unfiltered total that is not larger means `count` ignored the `where`
    // — the one bug a shared `where` object exists to prevent, and the one that
    // draws "Showing 1–10 of 400" above eleven rows.
    expect(filtered.total).toBe(TICKET_COUNT);
    expect(everything.total).toBeGreaterThan(filtered.total);
  });

  // One request per spelling rather than a loop over a list, so a failure names
  // the value that was accepted. `?page=` empty is in here because
  // `z.coerce.number()` turns "" into 0 — a route somebody could reasonably
  // expect to default instead.
  for (const page of ["0", "-1", "1.5", "abc", ""]) {
    test(`refuses ?page=${page || "(empty)"} with 400 invalid_query`, async ({
      request,
    }) => {
      await signInViaApi(request, AGENT);
      const response = await request.get(TICKETS_URL, { params: { page } });

      // Refused rather than silently defaulted to page 1, the same way a value
      // outside the sort allow-list is refused: a client that ships `?page=0`
      // should learn about it, not read a list that looks right.
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_query" });
    });
  }
});

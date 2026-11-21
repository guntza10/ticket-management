import { expect, type APIRequestContext } from "@playwright/test";
import { API_URL } from "./auth";
import {
  newInboundEmail,
  sendEmailExpectingNewTicket,
} from "./inbound-email";

export const TICKETS_URL = `${API_URL}/api/tickets`;

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
export const ALLOWED_TICKET_LIST_FIELDS = [
  "category",
  "createdAt",
  "id",
  "senderEmail",
  "senderName",
  "status",
  "subject",
];

/** One page of the list, exactly as the endpoint answers it. */
export async function readTicketPage(
  request: APIRequestContext,
  params?: Record<string, string>,
) {
  const response = await request.get(TICKETS_URL, params && { params });

  // Asserted here so a failure lands on the line that broke rather than later
  // on a confusing `undefined`.
  expect(response.status()).toBe(200);
  return (await response.json()) as {
    tickets: Record<string, unknown>[];
    total: number;
  };
}

/**
 * **Every row the list answers, across every page**, in the order the server
 * put them in.
 *
 * It lived in `tickets-api.spec.ts` until 2026-11-19, when
 * `tickets-api-filter.spec.ts` became a second caller — the same rule that put
 * `createUserViaApi` in support/users.ts. It read one request until
 * 2026-11-21, when `?page=` made that one request ten rows, and **every caller
 * here asks a question about the whole matching set**: "is the ticket I created
 * in the answer", "does AAA sort before ZZZ". Capping those at the first page
 * would not have failed loudly — `indexOf` answers `-1` for a row that was
 * simply on page 2, and `-1 < 4` is true, so a sorting test would have gone on
 * passing while proving nothing. Paging here keeps every existing assertion
 * meaning what it says.
 *
 * **In the default order, concurrent inserts can duplicate a row in this list
 * but cannot hide one.** A ticket another worker creates lands at the *front* of
 * `createdAt desc`, so the rows after it shift later and a page boundary
 * re-reads a row already collected; nothing moves a row earlier, so nothing is
 * skipped. A repeat is harmless to `toContain` and to a relative-order
 * assertion; **a count or a position would not be, and no caller may assert
 * one** — the rule `newSearchToken` above spells out.
 *
 * **That argument does not carry to `?sortBy=subject` or `?sortBy=senderName`,
 * and saying so is the whole point of this paragraph** (raised by
 * `clean-code-reviewer`, 2026-11-21). Another worker's ticket can sort
 * *between* rows already collected and push an unread row backwards across a
 * page boundary, where it is never read at all — and the assertion that then
 * passes vacuously is the ordinary one: `indexOf` answers `-1` for the missing
 * row and `-1 < 4` is true. So **a caller sorting by anything but the default
 * must narrow the answer to rows it created** (`search` with its own token, the
 * way the three sorting tests in tickets-api.spec.ts now do) and assert
 * `toContain` before comparing positions.
 *
 * `page` is sent as a plain number on every request, including the first, so a
 * caller's own `params` cannot collide with it silently.
 *
 * **Named `readAllTickets`, not `readTicketList`** (renamed 2026-11-21): it
 * makes one HTTP request per page, and the old name said nothing about that at
 * a call site. `readTicketPage` above is the single-request half, and the pair
 * now matches `readUserPage` / `readAllUsers` in support/users.ts.
 */
export async function readAllTickets(
  request: APIRequestContext,
  params?: Record<string, string>,
) {
  const rows: Record<string, unknown>[] = [];

  for (let page = 1; ; page += 1) {
    // A loop that reads a page, collects it and asks for the next one has to
    // end somewhere even if the endpoint answers something impossible. 50
    // pages is 500 rows, far past anything a run creates, so reaching it means
    // the exit conditions below are wrong rather than the data being large.
    expect(page, "readAllTickets paged far past the end").toBeLessThan(50);

    // `no-await-in-loop` is disabled for this one line, not for the file and
    // not in the config. The rule is about losing parallelism, and there is
    // none to lose here: the condition for asking for page N+1 is the answer
    // to page N — its rows and its total. `Promise.all` would need the page
    // count up front, which is the thing being read. The rule stays on
    // everywhere else, where it has real work to do: the filter spec fans out
    // one request per category with `Promise.all`.
    // eslint-disable-next-line no-await-in-loop
    const { tickets, total } = await readTicketPage(request, {
      ...params,
      page: String(page),
    });
    rows.push(...tickets);

    // Two exits, and both are needed. `rows.length >= total` is the ordinary
    // one; an empty page is the backstop for a `total` that disagrees with the
    // rows — without it a server answering `total: 999` and no rows would spin
    // to the cap above and fail with a confusing message.
    if (tickets.length === 0 || rows.length >= total) return rows;
  }
}

/**
 * A search term no other worker could be holding.
 *
 * Five workers share one `ticket_management_test` database that `globalSetup`
 * truncates once per *run*, so every ticket any spec posts is visible to every
 * other — `support/inbound-email.ts` spells that out at `newSubject`. A filter
 * is a property of the whole table, so a spec can only claim "the row I created
 * is in the answer" or "it is not", never a count or a position.
 *
 * A UUID is also what gives the negative assertions teeth: a search for a fresh
 * token can legitimately be expected to answer *nothing*, which a route or a
 * page that ignores the term fails immediately.
 *
 * It lived twice, as `searchToken()` in `tickets-api-filter.spec.ts` and
 * `filterToken()` in `tickets-filter.spec.ts`, until 2026-11-19 — two names for
 * one body, so `grep` on either found half the uses. Named once here on the
 * same rule that moved `readAllTickets` down: the second caller exists.
 */
export function newSearchToken() {
  return crypto.randomUUID();
}

/**
 * A new ticket whose subject is exactly what the caller asks for.
 *
 * `newInboundEmail(label)` builds the rest, so `label` must be safe inside an
 * email address — it becomes `sender-<label>-<uuid>@test.local`, and a space in
 * it makes the webhook answer 400 before a spec reaches its own assertion.
 */
export function createTicketWithSubject(
  request: APIRequestContext,
  label: string,
  subject: string,
) {
  return sendEmailExpectingNewTicket(request, {
    ...newInboundEmail(label),
    subject,
  });
}

/** The ids of every row the list answers, in the order it answered them. */
export async function readTicketIds(
  request: APIRequestContext,
  params?: Record<string, string>,
) {
  return (await readAllTickets(request, params)).map((ticket) => ticket.id);
}

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

/**
 * Reads the list and returns its rows, asserting only that the request
 * succeeded.
 *
 * It lived in `tickets-api.spec.ts` until 2026-11-19, when
 * `tickets-api-filter.spec.ts` became a second caller — the same rule that put
 * `createUserViaApi` in support/users.ts. Nothing about it changed in the move.
 */
export async function readTicketList(
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
 * same rule that moved `readTicketList` down: the second caller exists.
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
  return (await readTicketList(request, params)).map((ticket) => ticket.id);
}

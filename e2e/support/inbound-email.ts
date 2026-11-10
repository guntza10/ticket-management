import { expect, type APIRequestContext } from "@playwright/test";
import { API_URL } from "./auth";

export const INBOUND_EMAIL_URL = `${API_URL}/api/webhooks/inbound-email`;

/**
 * The secret `server/.env.test` sets, spelled out rather than imported.
 *
 * A spec that read the value the server reads could never notice the server
 * reading the wrong one — the same reason ALLOWED_FIELDS in support/users.ts is
 * a hand-written array instead of Object.keys(PUBLIC_USER_FIELDS).
 */
export const WEBHOOK_SECRET = "test-webhook-secret";

/**
 * Exactly the fields the webhook's answers select. Asserting the whole sorted
 * key set — not just that the expected values are present — is what makes this
 * a test of the allow-list: a bare create() would ship every column the table
 * happens to have, `updatedAt` and `subjectNormalized` today and whatever the
 * next migration adds tomorrow.
 */
export const ALLOWED_TICKET_FIELDS = [
  "assignedToId",
  "body",
  "bodyHtml",
  "category",
  "createdAt",
  "id",
  "senderEmail",
  "senderName",
  "status",
  "subject",
];

/**
 * A subject no other worker could pick.
 *
 * `playwright.config.ts` is `fullyParallel` with five workers against one
 * `ticket_management_test` database and `globalSetup` truncates once per run,
 * so every row a spec inserts is visible to every other spec in that run. The
 * duplicate guard matches on sender *and* subject, so both have to be unique
 * per spec or one spec's ticket answers another's request. A timestamp is not
 * enough: five workers can start inside the same millisecond.
 *
 * The flip side of the same rule: no spec may assert how many tickets exist, or
 * in what order. Identity is proven by comparing `ticket.id`, never by counting.
 */
export function newSubject(label: string) {
  return `Ticket ${label} ${crypto.randomUUID()}`;
}

export function newSenderEmail(label: string) {
  return `sender-${label}-${crypto.randomUUID()}@test.local`;
}

export type InboundEmail = {
  from: string;
  fromName: string;
  subject: string;
  body: string;
  bodyHtml?: string;
};

/** A complete, valid email. Spread it and override what a spec is about. */
export function newInboundEmail(label: string): InboundEmail {
  return {
    from: newSenderEmail(label),
    fromName: `Sender ${label}`,
    subject: newSubject(label),
    body: `Body of ${label}`,
  };
}

type PostOptions = {
  /**
   * The secret to send. `null` sends no header at all, which is a different
   * refusal from sending a wrong one — one field rather than a boolean beside
   * it, so `{ secret: "x", omitSecret: true }` is not a state anyone can write.
   */
  secret?: string | null;
  /** Put the secret in the query string instead, the way the reference project allows. */
  querySecret?: string;
};

/**
 * POSTs one email to the webhook. No session is involved at all — this is the
 * only endpoint in the app authenticated by a shared secret instead of a
 * cookie, so there is no `signInViaApi` here and no `origin` header either
 * (better-auth's CSRF gate guards its own routes, not this one).
 *
 * Nothing is asserted about the status: half these specs are about the status
 * being a refusal. The body is open to extra keys so a spec can send `status`
 * or `assignedToId` and prove zod strips them, without a cast at the call site.
 */
export function postInboundEmail(
  request: APIRequestContext,
  email: Partial<InboundEmail> & Record<string, unknown>,
  { secret = WEBHOOK_SECRET, querySecret }: PostOptions = {},
) {
  const query = querySecret === undefined ? "" : `?secret=${querySecret}`;

  return request.post(`${INBOUND_EMAIL_URL}${query}`, {
    headers: secret === null ? {} : { "x-webhook-secret": secret },
    data: email,
  });
}

/**
 * The statuses are spelled out rather than imported from the server, for the
 * same reason ALLOWED_TICKET_FIELDS is: a spec that reads the values under test
 * cannot notice the server using the wrong ones.
 */
export type TicketResponse = {
  id: number;
  subject: string;
  body: string;
  bodyHtml: string | null;
  status: "open" | "resolved" | "closed";
  category:
    | "general_question"
    | "technical_question"
    | "refund_request"
    | null;
  senderName: string;
  senderEmail: string;
  assignedToId: string | null;
  createdAt: string;
};

async function sendEmail(
  request: APIRequestContext,
  email: Partial<InboundEmail> & Record<string, unknown>,
  expectedStatus: 200 | 201,
) {
  const response = await postInboundEmail(request, email);

  // Asserted here so a failure lands on the line that broke rather than three
  // lines later on a confusing `undefined`.
  expect(response.status()).toBe(expectedStatus);
  const { ticket } = (await response.json()) as { ticket: TicketResponse };

  return ticket;
}

/**
 * 201 and 200 are the whole meaning of the duplicate guard, so they are two
 * named calls rather than one with a status-code argument: at a call site, a
 * bare `201` does not say which of two opposite rules the spec is about.
 */
export function sendEmailExpectingNewTicket(
  request: APIRequestContext,
  email: Partial<InboundEmail> & Record<string, unknown>,
) {
  return sendEmail(request, email, 201);
}

export function sendEmailExpectingExistingTicket(
  request: APIRequestContext,
  email: Partial<InboundEmail> & Record<string, unknown>,
) {
  return sendEmail(request, email, 200);
}

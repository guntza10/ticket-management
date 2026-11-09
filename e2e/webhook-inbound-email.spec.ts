import { test, expect } from "@playwright/test";
import {
  ALLOWED_TICKET_FIELDS,
  WEBHOOK_SECRET,
  newSubject,
  postInboundEmail,
  sendEmailExpecting,
  validEmail,
  type TicketResponse,
} from "./support/inbound-email";

// The first specs in this suite that never sign in. The webhook is called by a
// machine, so its guard is a shared secret rather than a session — there is no
// cookie to present and no origin header to satisfy.

test.describe("Inbound email webhook — the secret", () => {
  test("is 401 with no x-webhook-secret header", async ({ request }) => {
    const response = await postInboundEmail(request, validEmail("no-secret"), {
      omitSecret: true,
    });

    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid_webhook_secret" });
  });

  test("is 401 with the wrong secret", async ({ request }) => {
    const response = await postInboundEmail(
      request,
      validEmail("wrong-secret"),
      { secret: "not-the-secret" },
    );

    expect(response.status()).toBe(401);
  });

  // The course's guard also reads `req.query.secret`, so this request would be
  // accepted there. We refuse it: a credential in a URL lands in access logs,
  // proxy logs and error reports. Delete the `typeof provided !== "string"` /
  // header-only reading in require-webhook-secret.ts and only this test fails.
  test("is 401 when the secret is only in the query string", async ({
    request,
  }) => {
    const response = await postInboundEmail(
      request,
      validEmail("query-secret"),
      { omitSecret: true, query: `?secret=${WEBHOOK_SECRET}` },
    );

    expect(response.status()).toBe(401);
  });
});

test.describe("Inbound email webhook — validation", () => {
  test("is 400 when `from` is not an email address", async ({ request }) => {
    const response = await postInboundEmail(request, {
      ...validEmail("bad-from"),
      from: "not-an-email",
    });

    expect(response.status()).toBe(400);
    // The code, not a zod message: the client owns the prose, the API owns the
    // status code.
    expect(await response.json()).toEqual({ error: "invalid_body" });
  });

  test("is 400 when the subject is empty", async ({ request }) => {
    const response = await postInboundEmail(request, {
      ...validEmail("empty-subject"),
      subject: "",
    });

    expect(response.status()).toBe(400);
  });

  // Pins the order inside the schema: `.trim()` runs before `.min(1)`. Written
  // the other way round, this body would be accepted and stored as a ticket
  // whose subject is three spaces.
  test("is 400 when the subject is only whitespace", async ({ request }) => {
    const response = await postInboundEmail(request, {
      ...validEmail("blank-subject"),
      subject: "   ",
    });

    expect(response.status()).toBe(400);
  });

  test("is 400 when the body is empty", async ({ request }) => {
    const response = await postInboundEmail(request, {
      ...validEmail("empty-body"),
      body: "",
    });

    expect(response.status()).toBe(400);
  });

  test("is 400 when the request carries no body at all", async ({
    request,
  }) => {
    const response = await postInboundEmail(request, {});

    expect(response.status()).toBe(400);
  });

  // The course caps `body` at 1000 characters later in its build, which turns
  // any real support email into a flat 400 — and once a provider is posting,
  // a 400 means retried and then dropped. Add `.max(1000)` to the schema and
  // only this test fails.
  test("accepts a body far longer than a thousand characters", async ({
    request,
  }) => {
    const ticket = await sendEmailExpecting(
      request,
      { ...validEmail("long-body"), body: "x".repeat(5000) },
      201,
    );

    expect(ticket.body).toHaveLength(5000);
  });
});

test.describe("Inbound email webhook — creating a ticket", () => {
  test("stores the email as an open, uncategorised, unassigned ticket", async ({
    request,
  }) => {
    const email = validEmail("create");

    const ticket = await sendEmailExpecting(request, email, 201);

    // The allow-list, asserted as the whole sorted key set. `updatedAt` is a
    // real column deliberately left out of TICKET_FIELDS, so dropping the
    // `select` turns this line red.
    expect(Object.keys(ticket).sort()).toEqual(ALLOWED_TICKET_FIELDS);

    expect(ticket.subject).toBe(email.subject);
    expect(ticket.body).toBe(email.body);
    expect(ticket.senderName).toBe(email.fromName);
    expect(ticket.senderEmail).toBe(email.from);
    expect(ticket.bodyHtml).toBeNull();

    // The three fields the body cannot set. status comes from the column
    // default, and category/assignedToId stay null — uncategorised, and in the
    // shared pool.
    expect(ticket.status).toBe("open");
    expect(ticket.category).toBeNull();
    expect(ticket.assignedToId).toBeNull();
  });

  test("keeps the html part when the email carries one", async ({
    request,
  }) => {
    const ticket = await sendEmailExpecting(
      request,
      { ...validEmail("html"), bodyHtml: "<p>hello</p>" },
      201,
    );

    expect(ticket.bodyHtml).toBe("<p>hello</p>");
  });

  // zod strips keys it does not know, so a body asking for a closed, assigned,
  // pre-categorised ticket is ignored rather than refused — the same decision
  // POST /api/users makes about `role`.
  test("ignores status, category and assignee sent in the body", async ({
    request,
  }) => {
    const response = await postInboundEmail(request, {
      ...validEmail("smuggle"),
      status: "closed",
      category: "refund_request",
      assignedToId: "someone",
    });

    expect(response.status()).toBe(201);
    const { ticket } = (await response.json()) as { ticket: TicketResponse };
    expect(ticket.status).toBe("open");
    expect(ticket.category).toBeNull();
    expect(ticket.assignedToId).toBeNull();
  });

  // Lowercased by the schema, which the course does not do. It matters because
  // the duplicate guard below compares senderEmail as bytes, so the same person
  // writing from two capitalisations would otherwise be two senders.
  test("lowercases the sender address", async ({ request }) => {
    const email = validEmail("caps");
    const ticket = await sendEmailExpecting(
      request,
      { ...email, from: email.from.toUpperCase() },
      201,
    );

    expect(ticket.senderEmail).toBe(email.from.toLowerCase());
  });
});

test.describe("Inbound email webhook — the duplicate guard", () => {
  // A guard, not threading: there is no Reply model yet, so a match answers 200
  // with the ticket that already exists and the follow-up's body is written
  // nowhere. That is recorded as a known gap, not as intended behaviour.
  test("a Re: reply answers 200 with the same ticket", async ({ request }) => {
    const email = validEmail("reply");
    const first = await sendEmailExpecting(request, email, 201);

    const second = await sendEmailExpecting(
      request,
      { ...email, subject: `Re: ${email.subject}`, body: "following up" },
      200,
    );

    expect(second.id).toBe(first.id);
  });

  test("a Fwd:, a lowercase re: and a stacked Re: Re: all match", async ({
    request,
  }) => {
    const email = validEmail("prefixes");
    const first = await sendEmailExpecting(request, email, 201);

    // Promise.all rather than a loop of awaits, which oxlint's
    // no-await-in-loop refuses. Running them together is harmless and slightly
    // truer to life: all three only read the ticket the line above created.
    const matched = await Promise.all(
      ["Fwd: ", "re: ", "Re: Re: Re: "].map((prefix) =>
        sendEmailExpecting(
          request,
          { ...email, subject: `${prefix}${email.subject}` },
          200,
        ),
      ),
    );

    expect(matched.map((ticket) => ticket.id)).toEqual([
      first.id,
      first.id,
      first.id,
    ]);
  });

  test("a Re: on a subject nobody has written about creates a ticket, with the prefix stripped", async ({
    request,
  }) => {
    const subject = newSubject("unseen");

    const ticket = await sendEmailExpecting(
      request,
      { ...validEmail("unseen"), subject: `Re: ${subject}` },
      201,
    );

    expect(ticket.subject).toBe(subject);
  });

  test("the same subject from a different sender is a different ticket", async ({
    request,
  }) => {
    const email = validEmail("other-sender");
    const first = await sendEmailExpecting(request, email, 201);

    const second = await sendEmailExpecting(
      request,
      { ...validEmail("other-sender-2"), subject: `Re: ${email.subject}` },
      201,
    );

    expect(second.id).not.toBe(first.id);
  });

  // The deviation from the course that matters most. The course matches any
  // subject, so these two unrelated emails would collapse into one ticket and
  // the second body would be lost. Widen the `REPLY_PREFIX.test(...)` condition
  // in inbound-email.routes.ts to always run and only this test fails.
  test("the same subject twice without a reply prefix is two tickets", async ({
    request,
  }) => {
    const email = { ...validEmail("not-a-reply"), subject: newSubject("help") };

    const first = await sendEmailExpecting(request, email, 201);
    const second = await sendEmailExpecting(
      request,
      { ...email, body: "a different problem, same title" },
      201,
    );

    expect(second.id).not.toBe(first.id);
  });

  // One branch of the guard has no test here, written down rather than left as
  // a silent hole: it also requires status "open", so a reply to a *resolved*
  // ticket should create a new one. Nothing can resolve a ticket yet — there is
  // no PATCH endpoint, and these specs reach the database only over HTTP — so
  // that branch gets its test in the phase that adds one.
});

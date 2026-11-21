import { test, expect } from "@playwright/test";
import {
  ALLOWED_TICKET_FIELDS,
  WEBHOOK_SECRET,
  newInboundEmail,
  newSubject,
  postInboundEmail,
  sendEmailExpectingExistingTicket,
  sendEmailExpectingNewTicket,
} from "./support/inbound-email";

// The first specs in this suite that never sign in. The webhook is called by a
// machine, so its guard is a shared secret rather than a session — there is no
// cookie to present and no origin header to satisfy.

test.describe("Inbound email webhook — the secret", () => {
  test("is 401 with no x-webhook-secret header", async ({ request }) => {
    const response = await postInboundEmail(request, newInboundEmail("no-secret"), {
      secret: null,
    });

    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid_webhook_secret" });
  });

  test("is 401 with the wrong secret", async ({ request }) => {
    const response = await postInboundEmail(
      request,
      newInboundEmail("wrong-secret"),
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
      newInboundEmail("query-secret"),
      { secret: null, querySecret: WEBHOOK_SECRET },
    );

    expect(response.status()).toBe(401);
  });

  // Until this existed, no spec in the suite reached timingSafeEqual at all:
  // every wrong secret sent was a different length, so the length comparison
  // in front of it short-circuited and the byte comparison never ran. Dropping
  // the `!` from `!timingSafeEqual(...)` left the whole suite green, which is
  // the regression this closes.
  test("is 401 for a wrong secret of exactly the same length", async ({
    request,
  }) => {
    const sameLength = `${WEBHOOK_SECRET.slice(0, -1)}X`;
    expect(sameLength).toHaveLength(WEBHOOK_SECRET.length);

    const response = await postInboundEmail(request, newInboundEmail("same-length"), {
      secret: sameLength,
    });

    expect(response.status()).toBe(401);
  });

  // Node does not hand a duplicated header over as an array — it joins the
  // values with ", " — so this is the string the guard actually receives when a
  // caller sends x-webhook-secret twice. It is refused on length.
  test("is 401 when the secret header is sent twice", async ({ request }) => {
    const response = await postInboundEmail(request, newInboundEmail("twice"), {
      secret: `${WEBHOOK_SECRET}, junk`,
    });

    expect(response.status()).toBe(401);
  });
});

test.describe("Inbound email webhook — validation", () => {
  test("is 400 when `from` is not an email address", async ({ request }) => {
    const response = await postInboundEmail(request, {
      ...newInboundEmail("bad-from"),
      from: "not-an-email",
    });

    expect(response.status()).toBe(400);
    // The code, not a zod message: the client owns the prose, the API owns the
    // status code.
    expect(await response.json()).toEqual({ error: "invalid_body" });
  });

  test("is 400 when the subject is empty", async ({ request }) => {
    const response = await postInboundEmail(request, {
      ...newInboundEmail("empty-subject"),
      subject: "",
    });

    expect(response.status()).toBe(400);
  });

  // Pins the order inside the schema: `.trim()` runs before `.min(1)`. Written
  // the other way round, this body would be accepted and stored as a ticket
  // whose subject is three spaces.
  test("is 400 when the subject is only whitespace", async ({ request }) => {
    const response = await postInboundEmail(request, {
      ...newInboundEmail("blank-subject"),
      subject: "   ",
    });

    expect(response.status()).toBe(400);
  });

  test("is 400 when the body is empty", async ({ request }) => {
    const response = await postInboundEmail(request, {
      ...newInboundEmail("empty-body"),
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
  // The cap exists for CPU, not storage: `sanitizeBodyHtml` parses this string
  // on the one thread the server has. See BODY_HTML_MAX_LENGTH for the
  // measurements, and note what the pair below does **not** prove — that the
  // cap makes the pathological case fast. It does not; it bounds it.
  test("is 400 when the html part is longer than 64 KiB", async ({
    request,
  }) => {
    const response = await postInboundEmail(request, {
      ...newInboundEmail("html-too-long"),
      bodyHtml: `<p>${"a".repeat(64 * 1024)}</p>`,
    });

    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_body" });
  });

  test("accepts an html part just under the cap", async ({ request }) => {
    // 64 KiB exactly, so the pair brackets the boundary rather than testing one
    // side of it — an off-by-one in the `.max()` fails one of the two.
    const bodyHtml = `<p>${"a".repeat(64 * 1024 - 7)}</p>`;
    expect(bodyHtml).toHaveLength(64 * 1024);

    const ticket = await sendEmailExpectingNewTicket(request, {
      ...newInboundEmail("html-at-cap"),
      bodyHtml,
    });

    expect(ticket.bodyHtmlSanitized).toContain("<p>");
  });

  test("accepts a body far longer than a thousand characters", async ({
    request,
  }) => {
    const ticket = await sendEmailExpectingNewTicket(request, { ...newInboundEmail("long-body"), body: "x".repeat(5000) });

    expect(ticket.body).toHaveLength(5000);
  });
});

test.describe("Inbound email webhook — creating a ticket", () => {
  test("stores the email as an open, uncategorised, unassigned ticket", async ({
    request,
  }) => {
    const email = newInboundEmail("create");

    const ticket = await sendEmailExpectingNewTicket(request, email);

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
    const ticket = await sendEmailExpectingNewTicket(request, { ...newInboundEmail("html"), bodyHtml: "<p>hello</p>" });

    expect(ticket.bodyHtml).toBe("<p>hello</p>");
    // Harmless markup is not the sanitiser's business, so the two columns agree
    // here. The three tests below are the cases where they must not.
    expect(ticket.bodyHtmlSanitized).toBe("<p>hello</p>");
  });

  // The invariant a consumer's `if (bodyHtmlSanitized === null)` branch will
  // assume: the derived column is null **exactly** when the raw one is. It was
  // not true in the first version — `?? null` for one column and truthiness for
  // the other disagreed on `""`, which this route accepts because `bodyHtml` is
  // only `.optional()`.
  test("an empty html part leaves both columns agreeing", async ({
    request,
  }) => {
    const ticket = await sendEmailExpectingNewTicket(request, {
      ...newInboundEmail("empty-html"),
      bodyHtml: "",
    });

    expect(ticket.bodyHtml).toBe("");
    expect(ticket.bodyHtmlSanitized).toBe("");
  });

  test("writes no sanitised html when the email carries none", async ({
    request,
  }) => {
    const ticket = await sendEmailExpectingNewTicket(
      request,
      newInboundEmail("no-html"),
    );

    // Null rather than an empty string: there was no HTML part, which is a
    // different thing from an HTML part that sanitised down to nothing.
    expect(ticket.bodyHtml).toBeNull();
    expect(ticket.bodyHtmlSanitized).toBeNull();
  });

  // zod strips keys it does not know, so a body asking for a closed, assigned,
  // pre-categorised ticket is ignored rather than refused — the same decision
  // POST /api/users makes about `role`.
  test("ignores status, category and assignee sent in the body", async ({
    request,
  }) => {
    const ticket = await sendEmailExpectingNewTicket(request, {
      ...newInboundEmail("smuggle"),
      status: "closed",
      category: "refund_request",
      assignedToId: "someone",
    });

    expect(ticket.status).toBe("open");
    expect(ticket.category).toBeNull();
    expect(ticket.assignedToId).toBeNull();
  });

  // Lowercased by the schema, which the course does not do. It matters because
  // the duplicate guard below compares senderEmail as bytes, so the same person
  // writing from two capitalisations would otherwise be two senders.
  test("lowercases the sender address", async ({ request }) => {
    const email = newInboundEmail("caps");
    const ticket = await sendEmailExpectingNewTicket(request, { ...email, from: email.from.toUpperCase() });

    expect(ticket.senderEmail).toBe(email.from.toLowerCase());
  });
});

// **The sanitised column is the one every later consumer is allowed to read**,
// so these are the specs that make that worth relying on. They assert both
// columns every time: the sanitised one lost the dangerous part *and* the raw
// one kept it, because a sanitiser that rewrote the original in place would
// satisfy half of this and destroy the evidence of what was actually sent.
//
// Deliberately not a test of DOMPurify's allow-list — that library has been
// attacked for a decade and this suite is not going to improve on it. What is
// being proven is that it **runs**, on write, on this column, through this
// route: the three cases below are the ones that would reach a browser as
// script execution if it did not.
test.describe("Inbound email webhook — sanitising the html part", () => {
  test("strips a script tag, and keeps it in the raw column", async ({
    request,
  }) => {
    const ticket = await sendEmailExpectingNewTicket(request, {
      ...newInboundEmail("script"),
      bodyHtml: "<p>hello</p><script>alert(1)</script>",
    });

    expect(ticket.bodyHtmlSanitized).toBe("<p>hello</p>");
    expect(ticket.bodyHtml).toContain("<script>");
  });

  test("strips an event-handler attribute, and keeps the element", async ({
    request,
  }) => {
    const ticket = await sendEmailExpectingNewTicket(request, {
      ...newInboundEmail("onerror"),
      bodyHtml: '<img src="x" onerror="alert(1)">',
    });

    // The image survives and the handler does not: this is the case a
    // tag-level allow-list would pass and an attribute-level one catches.
    expect(ticket.bodyHtmlSanitized).toContain("<img");
    expect(ticket.bodyHtmlSanitized).not.toContain("onerror");
    expect(ticket.bodyHtml).toContain("onerror");
  });

  test("strips a javascript: link, and keeps the text around it", async ({
    request,
  }) => {
    const ticket = await sendEmailExpectingNewTicket(request, {
      ...newInboundEmail("js-url"),
      bodyHtml: '<a href="javascript:alert(1)">click</a>',
    });

    expect(ticket.bodyHtmlSanitized).not.toContain("javascript:");
    expect(ticket.bodyHtmlSanitized).toContain("click");
    expect(ticket.bodyHtml).toContain("javascript:");
  });

  test("leaves an ordinary link and ordinary formatting alone", async ({
    request,
  }) => {
    const ticket = await sendEmailExpectingNewTicket(request, {
      ...newInboundEmail("ordinary"),
      bodyHtml:
        '<p><b>Order 4182</b> — see <a href="https://example.com/orders/4182">the order</a></p>',
    });

    // The other half of the claim: a sanitiser that stripped everything would
    // pass all three tests above and make the detail page useless.
    expect(ticket.bodyHtmlSanitized).toContain("<b>Order 4182</b>");
    expect(ticket.bodyHtmlSanitized).toContain(
      'href="https://example.com/orders/4182"',
    );
  });
});

test.describe("Inbound email webhook — the duplicate guard", () => {
  // A guard, not threading: there is no Reply model yet, so a match answers 200
  // with the ticket that already exists and the follow-up's body is written
  // nowhere. That is recorded as a known gap, not as intended behaviour.
  test("a Re: reply answers 200 with the same ticket", async ({ request }) => {
    const email = newInboundEmail("reply");
    const first = await sendEmailExpectingNewTicket(request, email);

    const second = await sendEmailExpectingExistingTicket(request, { ...email, subject: `Re: ${email.subject}`, body: "following up" });

    expect(second.id).toBe(first.id);
  });

  // One test per prefix rather than three requests inside one. They used to go
  // out together through Promise.all, which was a shape the linter asked for
  // (no-await-in-loop) and not one the test wanted: the comment claimed they
  // only read the ticket created above, and that is true *only while the guard
  // works* — which is the thing under test. With the guard broken the three
  // race to create tickets and the failure stops being deterministic. A
  // separate test per prefix also names which prefix failed for free.
  for (const { prefix, label } of [
    { prefix: "Fwd: ", label: "fwd" },
    { prefix: "re: ", label: "lowercase" },
    { prefix: "Re: Re: Re: ", label: "stacked" },
  ]) {
    test(`a "${prefix}" subject joins the open ticket`, async ({ request }) => {
      const email = newInboundEmail(`prefix-${label}`);
      const first = await sendEmailExpectingNewTicket(request, email);

      const matched = await sendEmailExpectingExistingTicket(request, {
        ...email,
        subject: `${prefix}${email.subject}`,
      });

      expect(matched.id).toBe(first.id);
    });
  }

  test("a Re: on a subject nobody has written about creates a ticket, with the prefix stripped", async ({
    request,
  }) => {
    const subject = newSubject("unseen");

    const ticket = await sendEmailExpectingNewTicket(request, { ...newInboundEmail("unseen"), subject: `Re: ${subject}` });

    expect(ticket.subject).toBe(subject);
  });

  test("the same subject from a different sender is a different ticket", async ({
    request,
  }) => {
    const email = newInboundEmail("other-sender");
    const first = await sendEmailExpectingNewTicket(request, email);

    const second = await sendEmailExpectingNewTicket(request, { ...newInboundEmail("other-sender-2"), subject: `Re: ${email.subject}` });

    expect(second.id).not.toBe(first.id);
  });

  // The deviation from the course that matters most. The course matches any
  // subject, so these two unrelated emails would collapse into one ticket and
  // the second body would be lost. Widen the `REPLY_PREFIX.test(...)` condition
  // in inbound-email.routes.ts to always run and only this test fails.
  test("the same subject twice without a reply prefix is two tickets", async ({
    request,
  }) => {
    const email = { ...newInboundEmail("not-a-reply"), subject: newSubject("help") };

    const first = await sendEmailExpectingNewTicket(request, email);
    const second = await sendEmailExpectingNewTicket(request, { ...email, body: "a different problem, same title" });

    expect(second.id).not.toBe(first.id);
  });

  // The duplicate guard's `where` takes a caller-controlled subject. While it
  // compared with Prisma's `mode: "insensitive"` — which compiles to SQL ILIKE
  // on Postgres — `%` stayed a wildcard, so this body read a stranger's open
  // ticket, body and all, without knowing its subject. Proven by hand against
  // the dev server before the fix: it answered 200 with the other ticket.
  test("a wildcard subject cannot reach another ticket", async ({ request }) => {
    const email = newInboundEmail("wildcard");
    const first = await sendEmailExpectingNewTicket(request, email);

    const probe = await sendEmailExpectingNewTicket(request, { ...email, fromName: "probe", subject: "Re: %", body: "probe" });

    expect(probe.id).not.toBe(first.id);
    // Stored as the literal it is, not as a pattern that matched something.
    expect(probe.subject).toBe("%");
  });

  // The other half of the same fix, and the half an escaping-based fix tends to
  // break: a subject that genuinely contains % must still thread with itself.
  test("a subject containing % still threads with its own reply", async ({
    request,
  }) => {
    const subject = `${newSubject("percent")} 100% off`;
    const email = { ...newInboundEmail("percent"), subject };
    const first = await sendEmailExpectingNewTicket(request, email);

    const reply = await sendEmailExpectingExistingTicket(request, { ...email, subject: `Re: ${subject}` });

    expect(reply.id).toBe(first.id);
  });

  // One branch of the guard has no test here, written down rather than left as
  // a silent hole: it also requires status "open", so a reply to a *resolved*
  // ticket should create a new one. Nothing can resolve a ticket yet — there is
  // no PATCH endpoint, and these specs reach the database only over HTTP — so
  // that branch gets its test in the phase that adds one.
});

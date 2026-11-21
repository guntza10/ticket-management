import { Router } from "express";
import { z } from "zod";
import prisma from "../db.ts";
import { sanitizeBodyHtml } from "./sanitize-body-html.ts";
import { requireWebhookSecret } from "../require-webhook-secret.ts";

// Mounted at /api/webhooks/inbound-email by index.ts, so the one path below is
// relative to that. Why a webhook's route lives in src/tickets/, and why the
// guard is on the router rather than the route: server/CLAUDE.md, Module layout.
const router = Router();

router.use(requireWebhookSecret);

// An allow-list, not a convenience: a bare create() returns every column the
// table happens to have, including whatever the next migration adds. Named for
// what it is rather than for the model, because `updatedAt` and
// `subjectNormalized` are deliberately outside it — which is also what gives
// the specs' key-set assertion teeth.
//
// **It was `PUBLIC_TICKET_FIELDS` until 2026-11-21**, and the rename is about
// one of its members: it selects the raw `bodyHtml`, which the sanitisation
// work says may be rendered nowhere, and "public" is an invitation to reuse a
// constant for an answer it was not written for. This one describes *the
// webhook's* answer and nothing else. `server/CLAUDE.md` still schedules both
// ticket allow-lists to move into `src/tickets/ticket-fields.ts` the day
// `GET /api/tickets/:id` wants the full shape.
//
// The raw column is in here because the caller already holds those bytes — it
// posted them a moment ago — and because a spec needs to read it back to prove
// the original was not sanitised in place. No other answer carries it.
export const WEBHOOK_ANSWER_FIELDS = {
  id: true,
  subject: true,
  body: true,
  bodyHtml: true,
  bodyHtmlSanitized: true,
  status: true,
  category: true,
  senderName: true,
  senderEmail: true,
  assignedToId: true,
  createdAt: true,
};

// Not in core/. core/ holds what both workspaces must agree on, and the client
// never validates an inbound email — it does not send one. Only this route
// enforces this shape, so by that folder's own rule it does not belong there.
//
// `status`, `category` and `assignedToId` are absent on purpose, and the
// absence is what makes a body asking for them *stripped* rather than refused.
// `body` is deliberately not trimmed: that would edit the customer's message.
// `from` is lowercased because the duplicate guard compares senderEmail as
// bytes, so one person writing from two capitalisations would be two senders.
// RFC 5322 limits a header line to 998 characters, which is the one
// non-arbitrary ceiling available for the two fields that come off header
// lines. `body` is deliberately uncapped — see above — and that reasoning does
// not reach `subject`, which a ticket table will render.
const EMAIL_HEADER_MAX_LENGTH = 998;

/**
 * The longest HTML part this route will accept, and **it exists for CPU rather
 * than for storage.**
 *
 * `sanitizeBodyHtml` parses and re-serialises this string synchronously, on the
 * one thread the whole server shares, inside the request path — so the time it
 * takes is time every other caller waits. `body` next door is uncapped on
 * purpose (capping it would 400 a real support email) and that reasoning does
 * **not** carry here, because nothing parses `body`.
 *
 * **Measured 2026-11-21, and the shape of the cost is the point: it tracks
 * nesting depth, not length.**
 *
 *   | input                        | size      | sanitize() |
 *   | nested <div> x2000           |  9.8 KiB  |     96 ms  |
 *   | nested <div> x4000           | 19.5 KiB  | RangeError at 463 ms |
 *   | nested <div> x8000           | 39.1 KiB  | RangeError at 1841 ms |
 *   | 6000 flat <p> paragraphs     |  375 KiB  |     66 ms  |
 *
 * So this number is a **ceiling on the worst case, not a fix for it**: 64 KiB
 * of ordinary mail sanitises in a few milliseconds, while 64 KiB of pathology
 * costs a second or two and then throws `RangeError` out of parse5, which
 * Express answers as 500. A cap low enough to make the pathological case fast
 * (~8 KiB) would refuse ordinary HTML mail, and a cap generous enough for
 * ordinary mail cannot make it fast. Found by `security-reviewer`, which
 * measured the same shape through the route and recommended a length cap; the
 * measurement above is why the cap alone is not called a fix.
 *
 * **What would actually bound it**, in the order they are worth doing: the rate
 * limit the root CLAUDE.md's Known gaps already owes this route (it bounds
 * repetition, which is what turns one slow request into an outage), and moving
 * the sanitiser off the request path. A depth check before sanitising was
 * considered and refused — it means hand-writing a parser's worth of
 * `<`-counting over hostile input, which is new security-relevant code to get
 * wrong for a threat model that has no deployment in it.
 *
 * 64 KiB rather than a rounder number: `express.json()` already refuses a body
 * over 100 KiB, so this leaves room for the rest of the payload while being
 * far above any support email a person writes by hand.
 */
const BODY_HTML_MAX_LENGTH = 64 * 1024;

const inboundEmailSchema = z.object({
  from: z.email("Invalid email address").toLowerCase(),
  fromName: z
    .string()
    .trim()
    .min(1, "Sender name is required")
    .max(EMAIL_HEADER_MAX_LENGTH, "Sender name is too long"),
  subject: z
    .string()
    .trim()
    .min(1, "Subject is required")
    .max(EMAIL_HEADER_MAX_LENGTH, "Subject is too long"),
  body: z.string().min(1, "Body is required"),
  bodyHtml: z
    .string()
    .max(BODY_HTML_MAX_LENGTH, "HTML body is too long")
    .optional(),
});

// What a mail client puts in front of a subject when a person replies or
// forwards. No /g flag, so .test() carries no lastIndex between calls.
const REPLY_PREFIX = /^(Re:\s*|Fwd:\s*)+/i;

function stripSubjectPrefixes(subject: string) {
  return subject.replace(REPLY_PREFIX, "").trim();
}

// The same pattern asks two different questions, and only this one is a rule:
// whether to look for a ticket to join at all. Widening REPLY_PREFIX to cover
// AW: / Antwort: / 回复: — a cosmetic change to the stripper — widens the
// duplicate guard with it, which is the one thing "the same subject twice
// without a reply prefix is two tickets" exists to stop.
function looksLikeReply(subject: string) {
  return REPLY_PREFIX.test(subject);
}

router.post("/", async (req, res) => {
  const parsed = inboundEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }

  const email = parsed.data;
  const strippedSubject = stripSubjectPrefixes(email.subject);
  // Lower-cased once, stored, and matched on. See schema.prisma for why the
  // comparison may not go through `mode: "insensitive"`.
  const subjectNormalized = strippedSubject.toLowerCase();

  // A duplicate guard, not threading. There is no Reply model yet, so a match
  // answers 200 with the ticket that already exists and writes nothing at all.
  //
  // Which is exactly why it only runs when the subject *claims* to be a reply.
  // The course matches any subject, so two unrelated emails a customer happens
  // to title "Help" collapse into one ticket and the second one's body is
  // written nowhere. Creating one ticket too many is a mistake somebody can
  // see and fix; swallowing a customer's message is not.
  //
  if (looksLikeReply(email.subject)) {
    const existingTicket = await prisma.ticket.findFirst({
      where: {
        senderEmail: email.from,
        // Only an open ticket is joined. A reply to one already resolved or
        // closed starts a new ticket instead of reopening it, because reopening
        // is a product decision nobody has made yet — it is deferred in
        // _resources/project/requirements.md. This is the one condition here
        // with no spec: nothing can resolve a ticket until PATCH exists.
        status: "open",
        // Plain equality against the normalised column. Never `subject` with
        // `mode: "insensitive"` — that compiles to ILIKE and hands the caller a
        // wildcard. See schema.prisma.
        subjectNormalized,
      },
      select: WEBHOOK_ANSWER_FIELDS,
    });

    if (existingTicket) {
      res.status(200).json({ ticket: existingTicket });
      return;
    }
  }

  // The subject is stored stripped, so a reply's "Re: " never becomes part of
  // the ticket's name.
  const bodyHtml = email.bodyHtml ?? null;
  const ticket = await prisma.ticket.create({
    data: {
      subject: strippedSubject,
      subjectNormalized,
      body: email.body,
      // Both columns, from one value rather than from `email.bodyHtml` twice:
      // the raw HTML as evidence and the sanitised copy as the only one
      // anything else may read. Written this way so **the derived column is
      // null exactly when the raw one is** — the first version tested
      // `email.bodyHtml ?? null` for one and truthiness for the other, which
      // disagreed on `""` (a legal input, since the field is only
      // `.optional()`) and stored `""` beside `null`. Any consumer's
      // `if (bodyHtmlSanitized === null)` branch assumes they agree.
      // See sanitize-body-html.ts for why this runs here rather than at render.
      bodyHtml,
      bodyHtmlSanitized: bodyHtml === null ? null : sanitizeBodyHtml(bodyHtml),
      senderName: email.fromName,
      senderEmail: email.from,
    },
    select: WEBHOOK_ANSWER_FIELDS,
  });

  res.status(201).json({ ticket });
});

export default router;

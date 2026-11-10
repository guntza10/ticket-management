import { Router } from "express";
import { z } from "zod";
import prisma from "../db.ts";
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
export const PUBLIC_TICKET_FIELDS = {
  id: true,
  subject: true,
  body: true,
  bodyHtml: true,
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
  bodyHtml: z.string().optional(),
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
      select: PUBLIC_TICKET_FIELDS,
    });

    if (existingTicket) {
      res.status(200).json({ ticket: existingTicket });
      return;
    }
  }

  // The subject is stored stripped, so a reply's "Re: " never becomes part of
  // the ticket's name.
  const ticket = await prisma.ticket.create({
    data: {
      subject: strippedSubject,
      subjectNormalized,
      body: email.body,
      bodyHtml: email.bodyHtml ?? null,
      senderName: email.fromName,
      senderEmail: email.from,
    },
    select: PUBLIC_TICKET_FIELDS,
  });

  res.status(201).json({ ticket });
});

export default router;

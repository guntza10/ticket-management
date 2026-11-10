import { Router } from "express";
import { z } from "zod";
import prisma from "../db.ts";
import { requireWebhookSecret } from "../require-webhook-secret.ts";

// Mounted at /api/webhooks/inbound-email by index.ts, so the one path below is
// relative to that. The prefix lives at the mount for the same reason it does
// for /api/users: a rename touches one line instead of every route.
//
// Why this lives in src/tickets/ and not src/webhooks/ (which is where the
// course puts it): the module rule here is that an API resource is a folder,
// and that one module may not import another. A src/webhooks/ folder would have
// to write tickets, which means importing src/tickets/ — forbidden on arrival.
// So the folder follows the resource being written and the URL follows the
// caller. Those are two different things and only the URL is a webhook's.
const router = Router();

// On the router rather than on the route, which is what server/CLAUDE.md asks
// for when every route under a mount shares a guard: the mistake that ships is
// a new route added without it. That matters more here than on /api/users,
// because this is the one surface with no session layer behind the guard to
// catch the omission.
router.use(requireWebhookSecret);

// Exactly the fields every /api/webhooks answer is built from, and the fields
// the ticket endpoints will select when they land. An allow-list, not a
// convenience: a bare create() returns every column the table happens to have,
// including whatever the next migration adds.
//
// `updatedAt` is left out on purpose, and keeping one real column outside the
// list is what gives the specs' key-set assertion teeth — delete the `select`
// below and the answer grows a key the specs refuse. Add it the day something
// needs a "last activity" column.
export const TICKET_FIELDS = {
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
// Three fields are deliberately absent, and the absence is the design:
//   - `status`: a new ticket is always open, which the column's default says.
//     Leaving the key out means zod *strips* a body asking for
//     status: "closed" rather than refusing it — the same decision
//     createUserSchema makes about `role`.
//   - `category`: nothing picks one at intake; a classifier fills it later.
//   - `assignedToId`: assignment is its own endpoint. Accepting it here would
//     also mean answering for a foreign key and for an id belonging to a
//     soft-deleted user, which is a rule rather than a field.
//
// `body` is not trimmed and has no ceiling, both following the course at this
// step. Trimming would edit the customer's message, and the 1000-character cap
// the course adds later turns any real support email into a flat 400 — which,
// once a provider is posting, means the message is retried and then dropped.
//
// `from` IS lowercased, which the course does not do, and it is correctness
// rather than tidiness: the duplicate guard below matches senderEmail as bytes
// (only the subject comparison is case-insensitive), so the same person writing
// from Bob@Example.com and then bob@example.com would be two senders and the
// guard would miss. Same reasoning as createUserSchema, one notch weaker
// because nothing here signs in.
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

router.post("/", async (req, res) => {
  // safeParse rather than parse: a malformed body is the caller's mistake, so
  // it answers 400 instead of falling through to the 500 handler. Express 5
  // leaves req.body undefined when nothing parsed, which safeParse rejects on
  // its own — no property is read off it by hand.
  const parsed = inboundEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }

  const data = parsed.data;
  const strippedSubject = stripSubjectPrefixes(data.subject);
  // Lower-cased once here, stored, and matched on. See schema.prisma for why
  // the comparison may not go through `mode: "insensitive"`.
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
  // Real threading — keeping the follow-up as a Reply, matched on the RFC 5322
  // Message-ID / In-Reply-To / References headers — belongs to the phase that
  // connects a mail provider, because that is when those headers start
  // arriving. Nothing sends a message id to this endpoint today, so there is no
  // column here for one.
  if (REPLY_PREFIX.test(data.subject)) {
    const existingTicket = await prisma.ticket.findFirst({
      where: {
        senderEmail: data.from,
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
      select: TICKET_FIELDS,
    });

    if (existingTicket) {
      res.status(200).json({ ticket: existingTicket });
      return;
    }
  }

  // No try/catch: `ticket` carries no unique constraint and this body carries
  // no foreign key, so there is no Prisma error worth turning into a different
  // status code — and Express 5 forwards a rejection to the handler in index.ts
  // on its own. Catch only when the error should change the response.
  //
  // The subject is stored stripped, so a reply's "Re: " does not become part of
  // the ticket's name. status, category and assignedToId are left to their
  // column defaults, which is what makes a created ticket open, uncategorised
  // and in the shared pool.
  const ticket = await prisma.ticket.create({
    data: {
      subject: strippedSubject,
      subjectNormalized,
      body: data.body,
      bodyHtml: data.bodyHtml ?? null,
      senderName: data.fromName,
      senderEmail: data.from,
    },
    select: TICKET_FIELDS,
  });

  res.status(201).json({ ticket });
});

export default router;

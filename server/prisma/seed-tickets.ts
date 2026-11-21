import type {
  TicketCategory,
  TicketStatus,
} from "../src/generated/prisma/client.ts";
import prisma from "../src/db.ts";

// Sample tickets so the dev database has something for /tickets to render.
// Nothing in the product creates a ticket except POST /api/webhooks/inbound-email,
// and that route cannot set a status or a category — both are written by
// endpoints that do not exist yet — so a script is the only way to see a
// resolved ticket, a closed one, or the three category labels at once.
//
// DELIBERATELY NOT part of prisma/seed.ts. That file is what `db:seed:test`
// runs, and e2e/global-setup.ts runs it before every Playwright run, so a
// ticket seeded there would become a row every ticket spec sees but did not
// create — which is the exact thing e2e/README.md's parallel-safety rules
// exist to prevent. It would also make "No tickets found." unreachable in the
// test database.
//
// Guarded the opposite way round from prisma/truncate.ts, and for the same
// reason: the only thing separating the two databases is which env file loaded.
// Be exact about what that guard covers: it protects the *test* database by
// name. An ambient DATABASE_URL pointing at any other database not ending in
// _test — a staging box, a colleague's — would have its tickets deleted.
// Acceptable for a script only a developer runs by hand, and the reason it is
// wired into no other command.

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set — refusing to seed tickets.");
}

const database = new URL(url).pathname.slice(1);
if (database.endsWith("_test") || process.env.NODE_ENV === "test") {
  throw new Error(
    `Refusing to seed tickets into "${database}" — this script is for the dev database only. The test database is seeded by prisma/seed.ts via db:seed:test.`,
  );
}

// subject and subjectNormalized have to agree or the webhook's duplicate guard
// matches the wrong value (see the Known gaps table in the root CLAUDE.md).
// This script is the second writer of that pair, so it derives one from the
// other in one place instead of restating it per row.
function ticket(input: {
  subject: string;
  body: string;
  status: TicketStatus;
  category: TicketCategory | null;
  senderName: string;
  senderEmail: string;
  /** Hours before now — the spread is what makes "newest first" visible. */
  hoursAgo: number;
}) {
  const { hoursAgo, ...rest } = input;
  return {
    ...rest,
    subjectNormalized: input.subject.toLowerCase(),
    // createdAt carries @default(now()), but Prisma still lets a write set it.
    // Explicit timestamps beat sleeping between inserts: the order is stable
    // and the list is obviously sorted at a glance.
    createdAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
  };
}

const TICKETS = [
  ticket({
    subject: "Cannot reset my password",
    body: "I clicked the reset link in your email three times and nothing arrives. Can someone check my account?",
    status: "open",
    category: null,
    senderName: "Ana Ruiz",
    senderEmail: "ana.ruiz@example.com",
    hoursAgo: 1,
  }),
  ticket({
    subject: "Charged twice for the October invoice",
    body: "My card was billed 49.00 on the 2nd and again on the 3rd. I only have one subscription.",
    status: "open",
    category: "refund_request",
    senderName: "Marco Pinto",
    senderEmail: "marco.pinto@example.com",
    hoursAgo: 5,
  }),
  ticket({
    subject: "Export to CSV produces an empty file",
    body: "Exporting a report with more than ~2000 rows downloads a 0 byte file. Smaller reports are fine.",
    status: "open",
    category: "technical_question",
    senderName: "Priya Nair",
    senderEmail: "priya.nair@example.com",
    hoursAgo: 20,
  }),
  ticket({
    subject: "Do you offer a student discount?",
    body: "I am enrolled full time and wondered whether there is reduced pricing.",
    status: "resolved",
    category: "general_question",
    senderName: "Tom Weaver",
    senderEmail: "tom.weaver@example.com",
    hoursAgo: 49,
  }),
  ticket({
    subject: "Webhook deliveries stopped overnight",
    body: "Our endpoint received nothing after 02:00 UTC. It was responding 200 before that and still is.",
    status: "resolved",
    category: "technical_question",
    senderName: "Lena Hofer",
    senderEmail: "lena.hofer@example.com",
    hoursAgo: 74,
  }),
  ticket({
    subject: "Wrong address on my shipment",
    body: "Sorry, ignore this one, I sorted it out myself through the account page.",
    status: "closed",
    category: null,
    senderName: "Sam Okafor",
    senderEmail: "sam.okafor@example.com",
    hoursAgo: 120,
  }),
];

// How many rows the script should leave behind, read from the environment so
// the default stays the six hand-written tickets above and nobody's existing
// command changes meaning.
//
// **It exists because one page is ten rows.** `GET /api/tickets` answers
// `PAGE_SIZE` rows at a time, so six tickets cannot show a second page, a
// disabled Next button becoming enabled, or a page number in the URL — and the
// browser is where the footer has to be seen. Normally you want the named
// script, which sets this to 100:
//
//   npm run db:reseed:tickets:paged --workspace server
//
// The variable is still read from the environment, so any other count can be
// asked for by hand:
//
//   TICKET_SEED_COUNT=40 npm run db:reseed:tickets --workspace server
//
// **The script exists because the variable was undiscoverable.** It is set
// nowhere in the repo — not in `.env`, not in `.env.example` — so the only way
// to learn it existed was to open this file, and the dev database sat at 100
// rows with nothing recording how they got there (2026-11-21). A named script
// is the one spelling that shows up in `package.json` beside every other
// `db:*` command.
//
// Anything below the hand-written rows is ignored rather than refused: those
// six are the only ones that show a resolved ticket, a closed one and all three
// category labels, so trimming them would cost more than the request is worth.
const requestedCount = Number(process.env.TICKET_SEED_COUNT ?? TICKETS.length);
if (!Number.isInteger(requestedCount) || requestedCount < 1) {
  throw new Error(
    `TICKET_SEED_COUNT must be a positive whole number — got "${process.env.TICKET_SEED_COUNT}".`,
  );
}

/**
 * A list that is known to hold at least one element.
 *
 * Written once rather than spelled out per constant, which is what the four
 * lists below did until 2026-11-21 — one of them repeating its element type
 * twice inside a single annotation. It is what lets `cycle` below fall back to
 * element 0 without a non-null assertion: `noUncheckedIndexedAccess` makes
 * every other spelling of that a type error.
 */
type NonEmpty<T> = readonly [T, ...T[]];

type FillerSender = { name: string; email: string };

// Cycled through for the filler rows below. Three lists rather than one list of
// finished tickets, so the combinations do not repeat every six rows: a sort by
// subject, a sort by sender and a search for "invoice" all have something to
// show.
const FILLER_SUBJECTS: NonEmpty<string> = [
  "Invoice 2026-0114 does not match my plan",
  "API returns 500 on bulk upload",
  "How do I move a seat to another member?",
  "Refund for the duplicate annual charge",
  "Two-factor codes arrive several minutes late",
  "Can we get an invoice addressed to our company?",
  "Attachment larger than 10MB is silently dropped",
];
const FILLER_SENDERS: NonEmpty<FillerSender> = [
  { name: "Dana Kovac", email: "dana.kovac@example.com" },
  { name: "Ravi Menon", email: "ravi.menon@example.com" },
  { name: "Elif Demir", email: "elif.demir@example.com" },
  { name: "Noah Berger", email: "noah.berger@example.com" },
  { name: "Yuki Tanaka", email: "yuki.tanaka@example.com" },
];
const FILLER_STATUSES: NonEmpty<TicketStatus> = [
  "open",
  "open",
  "resolved",
  "closed",
];
const FILLER_CATEGORIES: NonEmpty<TicketCategory | null> = ["general_question", "technical_question", "refund_request", null];

/**
 * The element at `index`, wrapping round — so the four lists above combine into
 * rows that do not repeat until their lengths do.
 *
 * Named `cycle` rather than `pick` (2026-11-21) because the modulo is the
 * point, not an implementation detail: the whole reason for four lists of
 * different lengths is that cycling them together varies the combinations.
 */
function cycle<T>(items: NonEmpty<T>, index: number): T {
  return items[index % items.length] ?? items[0];
}

// The rows that pad the list out to `requestedCount`, numbered in the subject
// so a page can be identified at a glance in the browser. `hoursAgo` keeps
// climbing past the hand-written rows, so the default newest-first order puts
// the six interesting ones at the top and the filler behind them — which is
// also what makes "page 2 is different rows" obvious rather than a guess.
const filler = Array.from(
  { length: Math.max(0, requestedCount - TICKETS.length) },
  (_, index) => {
    const sender = cycle(FILLER_SENDERS, index);

    return ticket({
      subject: `${cycle(FILLER_SUBJECTS, index)} (#${index + 1})`,
      body: "Filler ticket written by prisma/seed-tickets.ts so the list has enough rows to page through.",
      status: cycle(FILLER_STATUSES, index),
      category: cycle(FILLER_CATEGORIES, index),
      senderName: sender.name,
      senderEmail: sender.email,
      hoursAgo: 144 + index * 3,
    });
  },
);

// Replaced rather than appended, so re-running gives the same rows instead
// of a growing pile. Dev tickets are disposable; the guard above is what makes
// that safe to say.
const { count: removed } = await prisma.ticket.deleteMany({});
const { count: created } = await prisma.ticket.createMany({
  data: [...TICKETS, ...filler],
});

console.log(
  `Seeded ${created} tickets into ${database} (removed ${removed} existing).`,
);
process.exit(0);

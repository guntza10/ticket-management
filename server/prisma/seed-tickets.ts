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

// Replaced rather than appended, so re-running gives the same six rows instead
// of a growing pile. Dev tickets are disposable; the guard above is what makes
// that safe to say.
const { count: removed } = await prisma.ticket.deleteMany({});
const { count: created } = await prisma.ticket.createMany({ data: TICKETS });

console.log(
  `Seeded ${created} tickets into ${database} (removed ${removed} existing).`,
);
process.exit(0);

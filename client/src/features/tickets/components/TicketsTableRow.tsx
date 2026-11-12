import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import type {
  TicketCategory,
  TicketRow,
  TicketStatus,
} from "../api/get-tickets";

// One row, one ticket — React's own criterion for splitting a UI up ("each
// component matches one piece of your data model"), which is why this has a
// file of its own despite a single caller. Extracted on day one together with
// TicketsTable rather than left for a later sweep to find: the 2026-10-26 sweep
// looked only for the record-shaped half and missed UsersTable entirely.

// Both maps below are annotated as a Record over the union rather than left to
// inference, and that is what makes them exhaustive: drop a member and tsc
// fails on the object itself, which is the line that has to change — not at the
// lookup further down, which is where an inferred object would send you.
//
// Be exact about what that does NOT cover, because the first version of this
// comment oversold it. The Record is exhaustive against the union in
// get-tickets.ts, which this client hand-writes. It is not checked against
// schema.prisma, and it only fires once somebody has already edited that union
// — which is the step that gets forgotten. **Nothing catches that step**, by
// decision: a type-level assertion that did was written and then removed, for
// costing more to read than it saved. Adding a status to the schema without
// updating that union reaches the browser as an **empty** badge: the lookup
// below answers `undefined`, so nothing renders inside it. That is worse to
// find than a raw `escalated` on screen, which anybody would report — an empty
// badge reads as "no status yet", a perfectly sensible answer. Cosmetic either
// way, and reachable only from a deliberate edit. Recorded in the root
// CLAUDE.md.
const statusVariant: Record<TicketStatus, "default" | "secondary" | "outline"> =
  {
    open: "default",
    resolved: "secondary",
    closed: "outline",
  };

// Capitalised for the same reason the categories are: _resources/project/mvp.md
// writes all three statuses as Open / Resolved / Closed, and schema.prisma says
// outright that the sentence a person reads is the client's job. Rendering the
// raw `open` was an inconsistency rather than a decision — found in review.
const statusLabel: Record<TicketStatus, string> = {
  open: "Open",
  resolved: "Resolved",
  closed: "Closed",
};

// The sentence a person reads, which schema.prisma says explicitly is the
// client's job ("General Question" is presentation). The wording comes from
// _resources/project/mvp.md, where the three categories are written out in
// capitals.
//
// A map rather than `category.replace(/_/g, " ")`: that yields "general
// question", and worse, it quietly invents a label for any enum member nobody
// has thought about. The same Record exhaustiveness as above refuses to compile
// instead. One reader today — hoist both maps to the feature root the day a
// filter dropdown needs the same strings.
const categoryLabel: Record<TicketCategory, string> = {
  general_question: "General Question",
  technical_question: "Technical Question",
  refund_request: "Refund Request",
};

export default function TicketsTableRow({ ticket }: { ticket: TicketRow }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{ticket.subject}</TableCell>
      {/* Two lines in one cell, not two columns: the name and the address
          identify one person, and a column each would mean a second header, a
          second skeleton cell and a colSpan bump to say that twice. */}
      <TableCell>
        <span className="block">{ticket.senderName}</span>
        <span className="text-muted-foreground block text-sm">
          {ticket.senderEmail}
        </span>
      </TableCell>
      <TableCell>
        <Badge variant={statusVariant[ticket.status]}>
          {statusLabel[ticket.status]}
        </Badge>
      </TableCell>
      {/* Null means "nobody has categorised this yet" — a real state the schema
          keeps askable by leaving the column nullable, so it gets an em dash.
          An empty cell reads as a rendering fault instead of as an answer. */}
      <TableCell>
        {ticket.category === null ? (
          "—"
        ) : (
          <Badge variant="secondary">{categoryLabel[ticket.category]}</Badge>
        )}
      </TableCell>
      <TableCell>{new Date(ticket.createdAt).toLocaleDateString()}</TableCell>
    </TableRow>
  );
}

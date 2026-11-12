import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { TICKETS_QUERY_KEY } from "./query-key";

// Hand-written to mirror the Postgres enums in server/prisma/schema.prisma, the
// same way UserRow spells out `role` as "agent" | "admin".
//
// Deliberately NOT in core/: that folder holds what *both* workspaces must
// agree on, and the server does not read these — it reads the enums Prisma
// generates for it. A file with one reader fails core/'s own rule, and core/
// may not touch Prisma at all.
//
// So nothing enforces the match, and that is a known, recorded gap rather than
// an oversight: adding a category to the schema means editing this line too.
// The next thing likely to touch the category set is Phase 5's classifier.
export type TicketStatus = "open" | "resolved" | "closed";
export type TicketCategory =
  | "general_question"
  | "technical_question"
  | "refund_request";

// Mirrors the `select` in GET /api/tickets, which is narrower than the inbound
// webhook's answer: no `body`, no `bodyHtml`. A list renders neither, and
// `bodyHtml` is stored unsanitised, so it must not travel here at all.
//
// `id` is a number, not a string — Ticket.id is an Int in Prisma, unlike
// User.id. When the detail page arrives its route param will come through as a
// string and will need converting; that mismatch is expected, not a bug.
//
// `createdAt` is a string because JSON has no date type, which is also part of
// why this type belongs to the client rather than to core/.
export type TicketRow = {
  id: number;
  subject: string;
  status: TicketStatus;
  category: TicketCategory | null;
  senderName: string;
  senderEmail: string;
  createdAt: string;
};

async function getTickets(signal: AbortSignal): Promise<TicketRow[]> {
  const { data } = await api.get<{ tickets: TicketRow[] }>("/api/tickets", {
    signal,
  });
  return data.tickets;
}

/**
 * The ticket list, newest first. The order is the server's and is not re-sorted
 * here — two places deciding one order is how they come to disagree.
 */
export function useTickets() {
  return useQuery({
    queryKey: TICKETS_QUERY_KEY,
    queryFn: ({ signal }) => getTickets(signal),
  });
}

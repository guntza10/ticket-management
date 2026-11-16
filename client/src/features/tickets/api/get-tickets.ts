import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { TicketListQuery } from "../../../../../core/schemas/tickets.ts";
import { ticketKeys } from "./query-key";

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

async function getTickets(
  signal: AbortSignal,
  query: TicketListQuery,
): Promise<TicketRow[]> {
  const { data } = await api.get<{ tickets: TicketRow[] }>("/api/tickets", {
    signal,
    params: query,
  });
  return data.tickets;
}

/**
 * The ticket list in the order the server put it in.
 *
 * `query` says which column and direction to *ask* for; it never says how to
 * arrange what comes back. Nothing here re-sorts the rows — two places deciding
 * one order is how they come to disagree, and once this list is paginated the
 * client would only be able to sort the page it can see.
 *
 * `keepPreviousData` is what makes a sort click feel like a sort rather than a
 * reload: the key changes, so without it React Query has no data for the new
 * key and the table falls back to its skeleton for the length of a round trip.
 * With it the rows that are on screen stay there until the new ones arrive.
 */
export function useTickets(query: TicketListQuery) {
  return useQuery({
    queryKey: ticketKeys.list(query),
    queryFn: ({ signal }) => getTickets(signal, query),
    placeholderData: keepPreviousData,
  });
}

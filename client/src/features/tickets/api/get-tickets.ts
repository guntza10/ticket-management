import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  TicketCategory,
  TicketListQuery,
  TicketStatus,
} from "../../../../../core/schemas/tickets.ts";
import { ticketKeys } from "./query-key";

// TicketStatus and TicketCategory were hand-written here until 2026-11-19, on
// the reasoning that core/ holds only what both workspaces must agree on and
// the server reads Prisma's generated enums instead of ours. Filtering made
// that false: `?status=` and `?category=` are validated against the same
// `ticketListQuerySchema` on both sides, so the two enums now have a real
// reader per side and belong in core/ by its own rule.
//
// What that bought is one TypeScript copy instead of two. What it did **not**
// buy is any link to `server/prisma/schema.prisma` — add a member to the
// Postgres enum, migrate, forget core/, and nothing goes red anywhere. That gap
// is unchanged and still recorded in the root CLAUDE.md.

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

/**
 * What GET /api/tickets answers: one page of rows, and how many rows match the
 * filters in total.
 *
 * `total` is the whole matching set, not this page's length — the footer needs
 * it to say how many pages there are, and `tickets.length` can only ever say
 * 10. Neither `page` nor `pageSize` comes back: the caller sent the first and
 * the second is `PAGE_SIZE`, which both sides import from core/.
 */
export type TicketListResponse = {
  tickets: TicketRow[];
  total: number;
};

async function getTickets(
  signal: AbortSignal,
  query: TicketListQuery,
): Promise<TicketListResponse> {
  // The whole response, where this used to unwrap `data.tickets`. Returning
  // only the rows would leave `total` nowhere — and putting it in a second
  // query would ask the server to count a filtered set twice.
  const { data } = await api.get<TicketListResponse>("/api/tickets", {
    signal,
    params: query,
  });
  return data;
}

/**
 * The ticket list in the order the server put it in.
 *
 * `query` says which column, direction and page to *ask* for; it never says how
 * to arrange what comes back. Nothing here re-sorts the rows — two places
 * deciding one order is how they come to disagree, and since this list is
 * paginated the client only ever holds the page it can see, so a client-side
 * sort would reorder ten rows out of forty and call it sorted.
 *
 * `keepPreviousData` is what makes a sort click feel like a sort rather than a
 * reload: the key changes, so without it React Query has no data for the new
 * key and the table falls back to its skeleton for the length of a round trip.
 * With it the rows that are on screen stay there until the new ones arrive —
 * which now covers paging too, and matters more there: the footer reads `total`
 * off this data, so without it every page click would blank the row count and
 * disable its own buttons for a round trip.
 */
export function useTickets(query: TicketListQuery) {
  return useQuery({
    queryKey: ticketKeys.list(query),
    queryFn: ({ signal }) => getTickets(signal, query),
    placeholderData: keepPreviousData,
  });
}

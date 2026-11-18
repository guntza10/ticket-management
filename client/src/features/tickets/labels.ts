import type {
  TicketCategory,
  TicketStatus,
} from "../../../../core/schemas/tickets.ts";

/**
 * What a status and a category are *called* on screen.
 *
 * Two readers, which is why this is a file rather than two consts inside
 * `components/columns.tsx` where it lived until 2026-11-19: the table's cells
 * print these, and `components/TicketsFilters.tsx` puts the same words in its
 * two dropdowns. A second copy beside the dropdown is a thing that has to agree
 * with this one and nothing would say when it stopped — rename a category and
 * the table and the filter would disagree about the same ticket.
 *
 * At the feature's root rather than in `components/`, because neither of the
 * two consumers owns it and neither is a component's detail. There is no
 * `types/` or `stores/` folder here for the same reason there is none in
 * `features/users/`: nothing has gone in them.
 *
 * **Keyed by the union, not built from the array.** A status added to
 * `TICKET_STATUSES` in core fails to compile here until somebody writes the
 * words for it — measured, both maps. Built with `.map()` off the array
 * instead, a new member would render as its raw enum spelling
 * (`refund_request`) and nothing would complain.
 *
 * The prose lives on the client on purpose: the server answers codes, the
 * client owns the words a person reads. That is the same split as
 * `invalid_body` versus the messages in `core/schemas/users.ts`.
 */
export const statusLabel: Record<TicketStatus, string> = {
  open: "Open",
  resolved: "Resolved",
  closed: "Closed",
};

export const categoryLabel: Record<TicketCategory, string> = {
  general_question: "General Question",
  technical_question: "Technical Question",
  refund_request: "Refund Request",
};

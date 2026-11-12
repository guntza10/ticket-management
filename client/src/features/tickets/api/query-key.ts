/**
 * The cache identity of the ticket list.
 *
 * A file of its own from the start even with a single reader, because the first
 * mutation to arrive (assignment, or a status change) has to invalidate this
 * exact key — and a mutation that names a slightly different one succeeds
 * silently while the table goes on showing the list from before.
 */
export const TICKETS_QUERY_KEY = ["tickets"] as const;

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import TicketsTableRow from "./TicketsTableRow";
import type { TicketRow } from "../api/get-tickets";

// The list as a table: the columns it has, and which of its three bodies to
// render. It mirrors the collection the way TicketsTableRow mirrors one record
// — React's guidance names both halves (`RecipeList` beside `Recipe`).
//
// What this file exists to hold is an agreement: the headers, the empty row's
// colSpan and the number of skeleton cells all have to say the same number, and
// here they say it in one place. TicketsTable.test.tsx then compares all three
// against the *rendered* header count rather than against 5, so a column that
// is genuinely added is followed and a half-added one fails.
//
// Not merged with UsersTable into a shared DataTable, and the reason is not
// "too early" but the test the house rule actually applies: repetition is worth
// removing when the copies **must change together**. These two never do — a
// column added to the roster says nothing about this list — so merging them
// would only mean opening a file the other table also uses. The structure is
// also about to stop matching: sorting, filtering and pagination are coming to
// this list and not to the roster, and the thing that solves those generically
// is TanStack Table, which is its own decision. Revisit at a third table.
export default function TicketsTable({
  tickets,
  isPending,
}: {
  tickets: TicketRow[] | undefined;
  isPending: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Subject</TableHead>
          <TableHead>Sender</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {/* Five placeholder rows — a guess at a list's length, which is fine,
            since the point is only to hold the shape until the data replaces
            it. Each has one cell per header above, widths roughly matching
            what arrives. */}
        {isPending &&
          Array.from({ length: 5 }, (_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-56" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-16" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-28" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
            </TableRow>
          ))}
        {/* colSpan has to match the header count above, and is asserted against
            the rendered headers rather than trusted. This body is the one state
            E2E cannot stage: five workers share one test database that is
            truncated once per run, and the other ticket specs insert rows. */}
        {tickets?.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-muted-foreground">
              No tickets found.
            </TableCell>
          </TableRow>
        )}
        {/* Rendered in the order the server sent — newest first. No sort here:
            see the note on useTickets. */}
        {tickets?.map((ticket) => (
          <TicketsTableRow key={ticket.id} ticket={ticket} />
        ))}
      </TableBody>
    </Table>
  );
}

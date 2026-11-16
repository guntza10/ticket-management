import { useTickets } from "@/features/tickets/api/get-tickets";
import TicketsTable from "@/features/tickets/components/TicketsTable";
import { useTicketSort } from "@/features/tickets/hooks/use-ticket-sort";
import NavBar from "@/components/NavBar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// The page fetches the list and frames it; the table knows what columns it has
// and which of its three bodies to show. No CardAction: nothing creates a
// ticket from the UI, by design — POST /api/webhooks/inbound-email is a
// ticket's only writer.
//
// Read-only for now on purpose: nothing on this page changes a ticket. What it
// can change is the question it asks — and the sort lives in the URL rather
// than in state here, which is the arrangement client/CLAUDE.md pre-committed
// to for filters. The page holds no sorting state of its own; useTicketSort
// reads the URL and hands back both spellings of it.
//
// Filtering, search and pagination are still later units and belong in the same
// place when they arrive.
export default function TicketsPage() {
  const { sorting, onSortingChange, listQuery } = useTicketSort();
  const { data: tickets, isPending, error } = useTickets(listQuery);

  return (
    <div className="min-h-screen bg-muted">
      <NavBar />
      <main className="mx-auto max-w-4xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Same arrangement as UsersPage, and copied rather than varied
                because a difference here would be one with no reason behind
                it: the error sits above the table so a failed background
                refetch leaves the previous rows usable, while the guard below
                means a failed *first* load — no rows, nothing in flight —
                renders no table at all. */}
            {error && <p className="text-destructive mb-4">{error.message}</p>}
            {(isPending || tickets) && (
              <TicketsTable
                tickets={tickets}
                isPending={isPending}
                sorting={sorting}
                onSortingChange={onSortingChange}
              />
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

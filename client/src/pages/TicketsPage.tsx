import { useTickets } from "@/features/tickets/api/get-tickets";
import TicketsTable from "@/features/tickets/components/TicketsTable";
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
// Read-only for now on purpose. Sorting, filtering, search and pagination are
// later units; when the filters arrive they belong in the URL, not in state
// here (see client/CLAUDE.md on state management).
export default function TicketsPage() {
  const { data: tickets, isPending, error } = useTickets();

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
              <TicketsTable tickets={tickets} isPending={isPending} />
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

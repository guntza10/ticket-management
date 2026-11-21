import { useTickets } from "@/features/tickets/api/get-tickets";
import TicketsFilters from "@/features/tickets/components/TicketsFilters";
import TicketsTable from "@/features/tickets/components/TicketsTable";
import { useTicketListQuery } from "@/features/tickets/hooks/use-ticket-list-query";
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
// can change is the question it asks — the sort and, since 2026-11-19, three
// filters — and all of it lives in the URL rather than in state here. The page
// holds no state at all; useTicketListQuery reads the URL and hands back every
// spelling of the query that something below needs.
//
// Pagination went in the same place, so the page is still stateless: `?page=`
// is read out of the URL by the same hook, handed to the table in TanStack's
// own spelling, and the footer that moves between pages lives inside the table
// because that is where the instance it reads is built.
export default function TicketsPage() {
  const {
    listQuery,
    sorting,
    onSortingChange,
    setFilters,
    pagination,
    onPaginationChange,
  } = useTicketListQuery();
  // The whole response, not just the rows: `total` is what the footer divides
  // by the page size to know how many pages there are, and `tickets.length`
  // cannot answer that — it is 10 on every page but the last.
  const { data, isPending, error } = useTickets(listQuery);

  return (
    <div className="min-h-screen bg-muted">
      <NavBar />
      <main className="mx-auto max-w-4xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Above the error, not below it: the toolbar is how somebody
                recovers from a filter that returned nothing, so it has to stay
                reachable when the request behind it failed. */}
            <TicketsFilters filters={listQuery} onChange={setFilters} />
            {/* Same arrangement as UsersPage, and copied rather than varied
                because a difference here would be one with no reason behind
                it: the error sits above the table so a failed background
                refetch leaves the previous rows usable, while the guard below
                means a failed *first* load — no rows, nothing in flight —
                renders no table at all. */}
            {error && <p className="text-destructive mb-4">{error.message}</p>}
            {(isPending || data) && (
              <TicketsTable
                tickets={data?.tickets}
                isPending={isPending}
                sorting={sorting}
                onSortingChange={onSortingChange}
                pagination={pagination}
                onPaginationChange={onPaginationChange}
                rowCount={data?.total}
              />
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

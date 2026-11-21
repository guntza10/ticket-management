import { useUsers } from "@/features/users/api/get-users";
import CreateUserDialog from "@/features/users/components/CreateUserDialog";
import UsersTable from "@/features/users/components/UsersTable";
import { useUserListQuery } from "@/features/users/hooks/use-user-list-query";
import NavBar from "@/components/NavBar";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// The page fetches the roster and frames it; the table itself knows what
// columns it has and which of its three bodies to show. The request, its row
// type and the cache key it reads under all live in features/users/api/, next
// to the mutations that invalidate that same key — naming a different one there
// is the silent failure this arrangement is for.
export default function UsersPage() {
  // Which page to show lives in the URL, not in state here — a refresh keeps
  // it, the back button walks back through the pages, and the view is a link
  // somebody can send. Same arrangement as /tickets, minus the sort and the
  // filters it has no controls for: the hook hands the page to the table in
  // TanStack's spelling, and the footer that moves between pages lives inside
  // `UsersTable`, where the table instance it reads is built.
  const { listQuery, pagination, onPaginationChange } = useUserListQuery();
  // The whole response: `total` is the count the footer divides by the page
  // size, and `users.length` cannot answer that.
  const { data, isPending, error } = useUsers(listQuery);

  return (
    <div className="min-h-screen bg-muted">
      <NavBar />
      <main className="mx-auto max-w-4xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
            {/* CardAction is card.tsx's own slot: CardHeader's grid switches to
                [1fr_auto] when one is present, so the button needs no layout
                classes. No role check here — the route is already admin-only
                and the endpoint refuses anyone else regardless. */}
            <CardAction>
              <CreateUserDialog />
            </CardAction>
          </CardHeader>
          <CardContent>
            {/* The error sits above the table instead of replacing it. A failed
                background refetch still leaves the previous rows on screen and
                usable — discarding them is the opposite of why the cache is
                here. Only a first load, which has no rows yet, shows the error
                alone, which is what the guard below is for: with no rows and
                nothing in flight there is no table worth rendering. */}
            {error && (
              <p className="text-destructive mb-4">{error.message}</p>
            )}
            {(isPending || data) && (
              <UsersTable
                users={data?.users}
                isPending={isPending}
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

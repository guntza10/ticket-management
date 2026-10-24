import { useUsers } from "@/features/users/api/get-users";
import CreateUserDialog from "@/features/users/components/CreateUserDialog";
import NavBar from "@/components/NavBar";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

// The page renders the roster; it does not define how the roster is fetched.
// The request, its row type and the cache key it reads under all live in
// features/users/api/, next to the two mutations that invalidate that same
// key — naming a different one there is the silent failure this arrangement
// is for.
export default function UsersPage() {
  const { data: users, isPending, error } = useUsers();

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
                alone. */}
            {error && (
              <p className="text-destructive mb-4">{error.message}</p>
            )}
            {(isPending || users) && (
              // The header is real even while loading: it is static content, and
              // rendering it up front is what keeps the skeleton the same shape
              // as the table that replaces it, so nothing shifts.
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Three placeholder rows — a guess at the roster size, which
                      is fine, since the point is only to hold the shape. */}
                  {isPending &&
                    Array.from({ length: 3 }, (_, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Skeleton className="h-4 w-28" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-44" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-14" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                      </TableRow>
                    ))}
                  {/* colSpan must match the header count above — a new column
                      added there has to be counted here too. */}
                  {users?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        No users found.
                      </TableCell>
                    </TableRow>
                  )}
                  {users?.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.role}</TableCell>
                      <TableCell>
                        {new Date(user.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

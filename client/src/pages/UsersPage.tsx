import { useQuery } from "@tanstack/react-query";
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
import { api } from "@/lib/api";

// Mirrors the `select` in GET /api/users. createdAt is a string, not a Date:
// JSON has no date type, so Prisma's DateTime arrives here as an ISO string.
export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "agent" | "admin";
  createdAt: string;
};

// No status check and no try/catch: axios rejects on 4xx/5xx, and React Query
// turns that rejection into the `error` below. The signal comes from React
// Query, which aborts it when the component unmounts or the query is replaced —
// the job the hand-rolled AbortController used to do.
async function getUsers(signal: AbortSignal): Promise<UserRow[]> {
  const { data } = await api.get<{ users: UserRow[] }>("/api/users", { signal });
  return data.users;
}

export default function UsersPage() {
  // queryKey is the cache's identity, not a label: anything that refetches or
  // invalidates this list — creating a user in Phase 3, say — names ["users"].
  const {
    data: users,
    isPending,
    error,
  } = useQuery({
    queryKey: ["users"],
    queryFn: ({ signal }) => getUsers(signal),
  });

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

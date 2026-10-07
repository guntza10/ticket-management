import { useQuery } from "@tanstack/react-query";
import NavBar from "@/components/NavBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";

// Mirrors the `select` in GET /api/users. createdAt is a string, not a Date:
// JSON has no date type, so Prisma's DateTime arrives here as an ISO string.
type UserRow = {
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
          </CardHeader>
          <CardContent>
            {isPending && (
              <p className="text-muted-foreground">Loading users…</p>
            )}
            {error && <p className="text-destructive">{error.message}</p>}
            {users && (
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
                  {users.map((user) => (
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

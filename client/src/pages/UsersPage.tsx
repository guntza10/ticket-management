import { useEffect, useState } from "react";
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
import { API_URL } from "@/lib/api";

// Mirrors the `select` in GET /api/users. createdAt is a string, not a Date:
// JSON has no date type, so Prisma's DateTime arrives here as an ISO string.
type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "agent" | "admin";
  createdAt: string;
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // StrictMode runs effects twice in dev, and a user can navigate away
    // mid-request; aborting on cleanup stops the stale response from landing
    // in state after the component is gone.
    const controller = new AbortController();

    async function loadUsers() {
      try {
        // credentials: "include" is what sends the session cookie. Without it
        // the browser omits cookies on a cross-origin call and the API — which
        // cannot tell us apart from a stranger — answers 401.
        const response = await fetch(`${API_URL}/api/users`, {
          credentials: "include",
          signal: controller.signal,
        });

        // fetch only rejects on a network failure; a 403 is a *successful*
        // HTTP exchange, so status has to be checked by hand.
        if (!response.ok) {
          throw new Error(`Could not load users (${String(response.status)})`);
        }

        const data = (await response.json()) as { users: UserRow[] };
        setUsers(data.users);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Could not load users");
      }
    }

    void loadUsers();
    return () => {
      controller.abort();
    };
  }, []);

  return (
    <div className="min-h-screen bg-muted">
      <NavBar />
      <main className="mx-auto max-w-4xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
          </CardHeader>
          <CardContent>
            {error !== null && <p className="text-destructive">{error}</p>}
            {error === null && users === null && (
              <p className="text-muted-foreground">Loading users…</p>
            )}
            {users !== null && (
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

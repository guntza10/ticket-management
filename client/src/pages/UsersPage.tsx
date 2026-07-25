import NavBar from "@/components/NavBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function UsersPage() {
  return (
    <div className="min-h-screen bg-muted">
      <NavBar />
      <main className="mx-auto max-w-4xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Admin-only. User management lands here.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

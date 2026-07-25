import NavBar from "@/components/NavBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-muted">
      <NavBar />
      <main className="mx-auto max-w-4xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Home</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">You are signed in.</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

import { useNavigate } from "react-router";
import { signOut, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

// Rendered only inside a protected route, so a session is guaranteed here.
export default function NavBar() {
  const navigate = useNavigate();
  const { data: session } = useSession();

  async function handleLogout() {
    await signOut();
    navigate("/login");
  }

  return (
    <header className="border-b bg-background">
      <nav className="mx-auto flex max-w-4xl items-center justify-between p-4">
        <span className="font-semibold">Ticket Management</span>
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground text-sm">
            {session?.user.name}
          </span>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </nav>
    </header>
  );
}

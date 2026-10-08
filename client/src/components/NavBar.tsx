import { Link, NavLink, useNavigate } from "react-router";
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
        <div className="flex items-center gap-4">
          {/* The app name doubles as the way home — the only route every
              signed-in user can reach, so it needs no role check. */}
          <Link to="/" className="font-semibold hover:opacity-80">
            Ticket Management
          </Link>
          {/* Admin-only link. Hiding it is UX, not security — the route it
              points to also guards on role, and the server must too. */}
          {session?.user.role === "admin" && (
            <NavLink
              to="/users"
              className={({ isActive }) =>
                isActive
                  ? "text-sm font-medium text-foreground"
                  : "text-sm text-muted-foreground hover:text-foreground"
              }
            >
              Users
            </NavLink>
          )}
        </div>
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

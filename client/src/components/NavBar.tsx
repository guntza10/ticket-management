import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import { signOut, useSession } from "@/lib/auth-client";
import ErrorDialog from "@/components/ErrorDialog";
import { Button } from "@/components/ui/button";

// Rendered only inside a protected route, so a session is guaranteed here.
export default function NavBar() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function handleLogout() {
    // better-auth's client never throws — every call answers { data, error } —
    // so awaiting it without reading `error` discards the only report of a
    // failure. That matters here more than most places: a sign-out the server
    // refused leaves the session cookie alive, and navigating to /login anyway
    // would bounce straight back to "/" (LoginPage redirects a signed-in
    // visitor), reading as the app ignoring the click.
    const { error } = await signOut();

    if (error) {
      // `||`, not `??`: `message` is `string | undefined`, so an empty string is
      // inside the type — and `??` would let it through, leaving the dialog shut
      // (it opens on a non-empty message) while the early return still skips the
      // navigation. That is the silent no-op this whole branch exists to remove.
      setSignOutError(error.message || "Could not sign you out. Please try again.");
      return;
    }

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

      <ErrorDialog
        title="Sign out failed"
        message={signOutError}
        onClose={() => setSignOutError(null)}
      />
    </header>
  );
}

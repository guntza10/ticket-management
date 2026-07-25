import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useSession } from "@/lib/auth-client";

// Guards a route: only renders its children when there is an active session.
// While the session request is in flight we avoid flashing the login page.
// Pass `role` to also require a specific role — a signed-in user whose role
// doesn't match is sent home (not to /login: they *are* authenticated, just
// not authorized). This is a UX guard only; real authorization must be
// enforced by the server on any endpoint that returns protected data.
export default function ProtectedRoute({
  children,
  role,
}: {
  children: ReactNode;
  role?: "agent" | "admin";
}) {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (role && session.user.role !== role) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

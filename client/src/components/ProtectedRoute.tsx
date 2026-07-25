import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useSession } from "../lib/auth-client.ts";

// Guards a route: only renders its children when there is an active session.
// While the session request is in flight we avoid flashing the login page.
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        Loading…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

import { useNavigate } from "react-router";
import { signOut, useSession } from "../lib/auth-client.ts";

// Rendered only inside a protected route, so a session is guaranteed here.
export default function NavBar() {
  const navigate = useNavigate();
  const { data: session } = useSession();

  async function handleLogout() {
    await signOut();
    navigate("/login");
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <nav className="mx-auto flex max-w-4xl items-center justify-between p-4">
        <span className="font-semibold text-gray-900">Ticket Management</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{session?.user.name}</span>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Log out
          </button>
        </div>
      </nav>
    </header>
  );
}

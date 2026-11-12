import { Routes, Route } from "react-router";
import LoginPage from "./pages/LoginPage.tsx";
import HomePage from "./pages/HomePage.tsx";
import TicketsPage from "./pages/TicketsPage.tsx";
import UsersPage from "./pages/UsersPage.tsx";
import ProtectedRoute from "./components/ProtectedRoute.tsx";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        }
      />
      {/* No `role` prop, unlike /users below: working tickets is what an
          agent is for, and an admin can do everything an agent can. Adding
          role="admin" here by copying the neighbour is the mistake this
          comment exists to stop — neither tsc nor oxlint can see it. */}
      <Route
        path="/tickets"
        element={
          <ProtectedRoute>
            <TicketsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute role="admin">
            <UsersPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

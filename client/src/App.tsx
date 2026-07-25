import { Routes, Route } from "react-router";
import LoginPage from "./pages/LoginPage.tsx";
import HomePage from "./pages/HomePage.tsx";
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

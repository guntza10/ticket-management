import type { FormEvent } from "react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { signIn, useSession } from "../lib/auth-client.ts";
import ErrorDialog from "../components/ErrorDialog.tsx";

export default function LoginPage() {
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {},
  );
  const [submitting, setSubmitting] = useState(false);
  const [dialogMessage, setDialogMessage] = useState("");

  // Already signed in → skip the login form.
  if (!isPending && session) {
    return <Navigate to="/" replace />;
  }

  // Standard field validation. Returns true when the form is safe to submit,
  // and populates inline messages otherwise.
  function validate() {
    const next: { email?: string; password?: string } = {};
    if (!email) {
      next.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "Enter a valid email address.";
    }
    if (!password) {
      next.password = "Password is required.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    const { error } = await signIn.email({ email, password });
    setSubmitting(false);

    // Auth / server errors surface in the dialog (not inline).
    if (error) {
      setDialogMessage(
        error.message ?? "Sign in failed. Please check your credentials.",
      );
      return;
    }
    navigate("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="w-full max-w-sm space-y-5 rounded-xl border border-gray-200 bg-white p-8 shadow-sm"
      >
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Sign in</h1>
          <p className="mt-1 text-sm text-gray-500">Ticket Management</p>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
          />
          {errors.email && (
            <p className="text-sm text-red-600">{errors.email}</p>
          )}
        </div>

        <div className="space-y-1">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
          />
          {errors.password && (
            <p className="text-sm text-red-600">{errors.password}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <ErrorDialog
        message={dialogMessage}
        onClose={() => setDialogMessage("")}
      />
    </div>
  );
}

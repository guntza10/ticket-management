import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Navigate, useNavigate } from "react-router";
import { signIn, useSession } from "../lib/auth-client.ts";
import ErrorDialog from "../components/ErrorDialog.tsx";

// The form's shape and rules live in one schema. zod validates at runtime,
// and z.infer derives the matching TypeScript type from it for free.
const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const [dialogMessage, setDialogMessage] = useState("");

  // useForm owns the field values, validation, and submit state. The resolver
  // wires zod in, so `errors` is populated from the schema's messages and
  // `isSubmitting` tracks the async onSubmit promise automatically.
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  // Already signed in → skip the login form.
  if (!isPending && session) {
    return <Navigate to="/" replace />;
  }

  // handleSubmit runs zod validation first; onSubmit only fires when the form
  // is valid, and receives `data` already typed as LoginForm.
  async function onSubmit(data: LoginForm) {
    const { error } = await signIn.email({
      email: data.email,
      password: data.password,
    });

    // Auth / server errors surface in the dialog (not inline).
    if (error) {
      setDialogMessage(
        error.message ?? "Sign in failed. Please check your credentials.",
      );
    } else {
      navigate("/");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
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
            autoComplete="email"
            {...register("email")}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
          />
          {errors.email && (
            <p className="text-sm text-red-600">{errors.email.message}</p>
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
            autoComplete="current-password"
            {...register("password")}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
          />
          {errors.password && (
            <p className="text-sm text-red-600">{errors.password.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <ErrorDialog message={dialogMessage} onClose={() => setDialogMessage("")} />
    </div>
  );
}

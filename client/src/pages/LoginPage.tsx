import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Navigate, useNavigate } from "react-router";
import { signIn, useSession } from "@/lib/auth-client";
import ErrorDialog from "@/components/ErrorDialog";
import PasswordInput from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
  const [signInError, setSignInError] = useState<string | null>(null);

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

    // Auth / server errors surface in the dialog (not inline). `||` rather than
    // `??` for the same reason as NavBar: an empty message would leave the
    // dialog shut and the page silent.
    if (error) {
      setSignInError(
        error.message || "Sign in failed. Please check your credentials.",
      );
    } else {
      navigate("/");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Ticket Management</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Field / FieldLabel / FieldError are shadcn's own form primitives,
              so the label-and-error shape is not hand-rolled per field. They
              are markup only — `register` keeps the inputs uncontrolled, so the
              id still pairs with htmlFor by hand. */}
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={!!errors.email}
                  {...register("email")}
                />
                <FieldError errors={[errors.email]} />
              </Field>

              <Field data-invalid={!!errors.password}>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  aria-invalid={!!errors.password}
                  {...register("password")}
                />
                <FieldError errors={[errors.password]} />
              </Field>

              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? "Signing in…" : "Sign in"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <ErrorDialog
        title="Sign in failed"
        message={signInError}
        onClose={() => setSignInError(null)}
      />
    </div>
  );
}

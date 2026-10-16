import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { api } from "@/lib/api";
import PasswordInput from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Deliberately duplicated in server/src/users/create-user.ts — see the comment
// there for why a shared workspace cannot hold it. The guard against the two drifting
// is the API spec "POST /api/users is 400 when the password is shorter than 8
// characters": relax the rule on one side only and that spec goes red.
//
// This copy is not the security boundary. The server re-checks every field,
// because anything reachable by fetch is reachable by curl; validating here
// only saves a round-trip.
const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  email: z.email("Enter a valid email address.").toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

type CreateUserValues = z.infer<typeof createUserSchema>;

// The three fields differ only in their control, so the surrounding shape lives
// here once. `id` is passed to both this wrapper and the control on purpose:
// without shadcn's form.tsx there is no context to carry it, and an explicit
// pair is better than a label pointing at nothing. LoginPage still writes this
// shape out inline — promoting it to a shared component is a fair follow-up,
// not this change's job.
function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

export default function CreateUserForm({
  onCreated,
}: {
  onCreated: () => void;
}) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserValues>({ resolver: zodResolver(createUserSchema) });

  // The repo's first useMutation. The response body is ignored on purpose: the
  // table reads from the ["users"] query, so there is nothing to write into the
  // cache by hand and no reason to couple this form to the row type.
  const { mutateAsync } = useMutation({
    mutationFn: (user: CreateUserValues) => api.post("/api/users", user),
    // Returned, not fired and forgotten. mutateAsync then settles only once the
    // roster has actually refetched, so the dialog closes onto a table that
    // already holds the new row instead of racing it.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  async function onSubmit(values: CreateUserValues) {
    try {
      await mutateAsync(values);
      onCreated();
    } catch (error) {
      // A taken address belongs under the email field, inside the dialog that
      // is already open — routing it to the shared ErrorDialog would stack a
      // second dialog over the form the person has to correct. setError also
      // lights aria-invalid and clears itself on the next submit, so there is
      // no extra state to reset.
      if (isAxiosError(error) && error.response?.status === 409) {
        setError("email", {
          message: "That email address is already in use.",
        });
        return;
      }
      // Anything else is not about one field, so it reads as form-level.
      setError("root", {
        message: "Could not create the user. Please try again.",
      });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <Field id="create-user-name" label="Name" error={errors.name?.message}>
        <Input
          id="create-user-name"
          autoComplete="off"
          aria-invalid={!!errors.name}
          {...register("name")}
        />
      </Field>

      <Field id="create-user-email" label="Email" error={errors.email?.message}>
        <Input
          id="create-user-email"
          type="email"
          // off, not "email": the browser would otherwise offer the signed-in
          // admin's own address for an account that is not theirs.
          autoComplete="off"
          aria-invalid={!!errors.email}
          {...register("email")}
        />
      </Field>

      <Field
        id="create-user-password"
        label="Password"
        error={errors.password?.message}
      >
        <PasswordInput
          id="create-user-password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          {...register("password")}
        />
      </Field>

      {errors.root && (
        <p className="text-destructive text-sm">{errors.root.message}</p>
      )}

      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating…" : "Create"}
        </Button>
      </DialogFooter>
    </form>
  );
}

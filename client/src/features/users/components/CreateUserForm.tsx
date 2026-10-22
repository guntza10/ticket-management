import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { api } from "@/lib/api";
import PasswordInput from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  createUserSchema,
  type CreateUserInput,
} from "../../../../../core/schemas/users.ts";

// Validating here is not the security boundary — it only saves a round-trip.
// The server parses the same schema from the same file, because anything
// reachable by fetch is reachable by curl.

// The write and the cache it has to refresh, named as one thing: at the call
// site this reads as `useCreateUser()` instead of a queryClient, a useMutation
// and a cache key threaded through the markup. The repo's first useMutation.
// The response body is ignored on purpose: the table reads from the ["users"]
// query, so there is nothing to write into the cache by hand and no reason to
// couple this form to the row type.
//
// It stays in this file while it is the only one. The day edit and delete
// arrive they will each need the same ["users"] key from their own component,
// and a hook pinned to the bottom of this one cannot be shared — that is the
// point to lift all three into a module of their own, not before.
function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (user: CreateUserInput) => api.post("/api/users", user),
    // Returned, not fired and forgotten. mutateAsync then settles only once the
    // roster has actually refetched, so the dialog closes onto a table that
    // already holds the new row instead of racing it.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export default function CreateUserForm({
  onCreated,
}: {
  onCreated: () => void;
}) {
  const { mutateAsync } = useCreateUser();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    // react-hook-form recommends defaults for the form as a whole. These inputs
    // are uncontrolled so they would read "" off the DOM regardless, but
    // isDirty, watch and reset all compare against this object — the edit form
    // that copies this pattern needs all three.
    defaultValues: { name: "", email: "", password: "" },
  });

  async function onSubmit(values: CreateUserInput) {
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
        setError(
          "email",
          { message: "That email address is already in use." },
          // Move the cursor to the field that has to change; without it focus
          // stays on the submit button that was just pressed.
          { shouldFocus: true },
        );
        return;
      }
      // Anything else is not about one field, so it reads as form-level.
      setError("root", {
        message: "Could not create the user. Please try again.",
      });
    }
  }

  // Written the way shadcn's own Field docs write it: the primitives in place,
  // id paired with htmlFor by hand, aria-invalid on the control. They are
  // markup only — no useId, no context — and the docs leave it that way on
  // purpose so Field fits any form library. Deliberately not wrapped in a
  // shared field component: matching the documented shape is worth the few
  // extra lines, because it is the shape anything written about shadcn will
  // describe.
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="create-user-name">Name</FieldLabel>
          <Input
            id="create-user-name"
            autoComplete="off"
            aria-invalid={!!errors.name}
            {...register("name")}
          />
          <FieldError errors={[errors.name]} />
        </Field>

        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="create-user-email">Email</FieldLabel>
          <Input
            id="create-user-email"
            type="email"
            // off, not "email": the browser would otherwise offer the signed-in
            // admin's own address for an account that is not theirs.
            autoComplete="off"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
          <FieldError errors={[errors.email]} />
        </Field>

        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="create-user-password">Password</FieldLabel>
          <PasswordInput
            id="create-user-password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
          <FieldError errors={[errors.password]} />
        </Field>

        {/* Form-level, so it sits outside every Field. Same `errors` spelling
            as the fields above — FieldError takes either that or children, and
            one of the two is enough to learn. It renders nothing when handed
            nothing, which is why there is no condition around it. */}
        <FieldError errors={[errors.root]} />

        <DialogFooter>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  );
}

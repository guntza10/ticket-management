import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { isAxiosError } from "axios";
import PasswordInput from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useUpdateUser } from "../api/update-user";
import type { UserRow } from "../api/get-users";
import {
  updateUserSchema,
  type UpdateUserInput,
} from "../../../../../core/schemas/users.ts";

// The part of a roster row this form touches — derived from UserRow rather
// than restated, so a change to the row's shape reaches the form instead of
// drifting past it. `id` is in here because the request needs it in the URL,
// not because it is editable.
//
// It was three hand-written fields until 2026-10-23, when UserRow moved out of
// pages/UsersPage.tsx into this feature. A feature may not import from pages/,
// so before that move there was no legal way to point at it.
export type EditableUser = Pick<UserRow, "id" | "name" | "email">;

export default function EditUserForm({
  user,
  onSaved,
}: {
  user: EditableUser;
  onSaved: () => void;
}) {
  const { mutateAsync } = useUpdateUser(user.id);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UpdateUserInput>({
    resolver: zodResolver(updateUserSchema),
    // This is the prefill, and it is also what isDirty compares against — the
    // Save button below is disabled until something actually differs from the
    // row. password starts "" because there is nothing to prefill it with: the
    // database holds a hash, and "" is what this form reads as "leave it".
    defaultValues: { name: user.name, email: user.email, password: "" },
  });

  async function onSubmit(values: UpdateUserInput) {
    try {
      // values.password is undefined when the field was left blank, and
      // JSON.stringify drops an undefined value — so the request body carries
      // no password key at all and the server has nothing to hash. See
      // updateUserSchema for why "no change" cannot be the same value resent.
      await mutateAsync(values);
      onSaved();
    } catch (error) {
      // Same two doors as CreateUserForm: a taken address belongs under the
      // email field inside the dialog that is already open, everything else is
      // form-level. 404 lands in the generic branch on purpose — a row that
      // vanished mid-edit is not a field the person can correct.
      if (isAxiosError(error) && error.response?.status === 409) {
        setError(
          "email",
          { message: "That email address is already in use." },
          { shouldFocus: true },
        );
        return;
      }
      setError("root", {
        message: "Could not save the changes. Please try again.",
      });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="edit-user-name">Name</FieldLabel>
          <Input
            id="edit-user-name"
            autoComplete="off"
            aria-invalid={!!errors.name}
            {...register("name")}
          />
          <FieldError errors={[errors.name]} />
        </Field>

        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="edit-user-email">Email</FieldLabel>
          <Input
            id="edit-user-email"
            type="email"
            // off, not "email": the browser would offer the signed-in admin's
            // own address for an account that is not theirs.
            autoComplete="off"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
          <FieldError errors={[errors.email]} />
        </Field>

        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="edit-user-password">New password</FieldLabel>
          <PasswordInput
            id="edit-user-password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
          {/* The one place the blank-means-unchanged rule is stated to the
              person filling the form in. Without it an empty field reads as
              "this account has no password". */}
          <FieldDescription>
            Leave blank to keep the current password.
          </FieldDescription>
          <FieldError errors={[errors.password]} />
        </Field>

        <FieldError errors={[errors.root]} />

        <DialogFooter>
          {/* Disabled until something differs from the row this dialog opened
              on — which is the whole reason useForm is given defaultValues.
              A submit that changes nothing would still re-run the update and
              invalidate the roster for no reason. */}
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  );
}

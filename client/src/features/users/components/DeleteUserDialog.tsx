import { useState } from "react";
import { Trash2 } from "lucide-react";
import ErrorDialog from "@/components/ErrorDialog";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useDeleteUser } from "../api/delete-user";
import type { UserRow } from "../api/get-users";

// Only what the confirmation needs: the id to send and the name to say out
// loud. Derived from UserRow so the roster's shape reaches it.
export type DeletableUser = Pick<UserRow, "id" | "name">;

// AlertDialog rather than Dialog: it renders role="alertdialog" and takes a
// deliberate choice rather than an idle dismissal, which is what a destructive
// action should ask for.
export default function DeleteUserDialog({ user }: { user: DeletableUser }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync, isPending } = useDeleteUser(user.id);

  async function handleConfirm() {
    try {
      await mutateAsync();
      setOpen(false);
    } catch {
      // Close this one too, in the same batch. There is no field for "the
      // delete failed" to land on, so it goes to ErrorDialog — and two Radix
      // portals open at once fight over a single focus trap, which is a real
      // bug rather than a cosmetic one.
      //
      // The order of these two lines does *not* matter, and this comment used
      // to say it did: React batches both setState calls into one re-render,
      // so there is no frame in which both dialogs are mounted either way. What
      // would break is an `await` between them, or closing not at all.
      setOpen(false);
      setError("Could not delete the user. Please try again.");
    }
  }

  return (
    <>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          {/* aria-label because the button has no text: without it the
              accessible name is empty, and neither a screen reader nor a test
              can tell one row's button from another's. */}
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete ${user.name}`}
          >
            <Trash2 />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {user.name}?</AlertDialogTitle>
            {/* Says what actually happens. The row survives and keeps its
                address, which is why re-creating that address will be refused
                — stating it here is cheaper than explaining the 409 later. */}
            <AlertDialogDescription>
              They will be signed out and will not be able to sign in again.
              The account stays on this list, and its email address stays
              taken.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            {/* preventDefault because Radix closes on click by default, and the
                dialog has to stay up while the request is unanswered — that is
                the only place the pending state is visible. */}
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirm();
              }}
            >
              {isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ErrorDialog
        title="Delete failed"
        message={error}
        onClose={() => setError(null)}
      />
    </>
  );
}

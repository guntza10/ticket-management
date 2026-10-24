import { useState } from "react";
import { Pencil } from "lucide-react";
import EditUserForm, { type EditableUser } from "./EditUserForm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// One of these per table row, each holding its own `open`. The alternative —
// a single dialog on the page plus a "which row is being edited" state — needs
// the row to be remembered somewhere above the table and a null check on every
// read of it. A dialog per row has neither: the row it edits is the prop it was
// rendered with.
//
// Nothing is mounted per row but the trigger button: Radix renders
// DialogContent only while open, so ten rows are ten buttons, not ten forms.
export default function EditUserDialog({ user }: { user: EditableUser }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {/* aria-label, not a bare icon: an icon button has no text, so without
            it the accessible name is empty and neither a screen reader nor a
            test can tell one row's button from another's. The name carries the
            row's name for exactly that reason. Same shape as PasswordInput's
            toggle. */}
        <Button variant="ghost" size="icon" aria-label={`Edit ${user.name}`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            Changing the password is optional. The role cannot be changed here.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, which is what makes the prefill correct
            rather than merely initial: the form's defaultValues are read on
            mount, so reopening after a refetch shows the current row and an
            abandoned edit cannot survive a close. */}
        <EditUserForm user={user} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

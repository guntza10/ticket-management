import { useState } from "react";
import CreateUserForm from "@/components/CreateUserForm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// The trigger and the dialog it opens, kept together so nothing else has to
// hold the open state. The Root stays controlled — `open` is ours — because
// success has to close it from inside the form; a DialogTrigger inside a
// controlled Root just calls onOpenChange(true), so both still work.
export default function CreateUserDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Create user</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          {/* Radix warns without a description, and this is the one place the
              forced role is stated: the form has no role field because the
              server assigns it and refuses to be told otherwise. */}
          <DialogDescription>
            New accounts are created with the agent role.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open. Radix unmounts DialogContent on close, so
            the form's state goes with it and every open starts blank — there is
            no reset() to remember, and yesterday's error cannot reappear. */}
        <CreateUserForm onCreated={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// A shadcn Dialog shown only for auth/server errors. It is driven by the
// `message` prop: a non-empty message opens it. Any close path (OK button,
// Escape, backdrop, or the built-in X) triggers onOpenChange, which calls
// `onClose` so the parent can clear the message.
//
// `title` is required rather than defaulted: each caller reports a different
// failure, and a default would quietly label a failed sign-*out* as a failed
// sign-in — the one thing the heading exists to tell apart.
export default function ErrorDialog({
  title,
  message,
  onClose,
}: {
  title: string;
  message: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!message}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onClose}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

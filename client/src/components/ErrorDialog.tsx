import { useEffect, useRef } from "react";

// A native <dialog> shown only for auth/server errors. It is driven by the
// `message` prop: a non-empty message opens the modal; closing it (OK button,
// Escape key, or backdrop) fires the dialog's `close` event, which calls
// `onClose` so the parent can clear the message.
export default function ErrorDialog({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (message && !dialog.open) {
      dialog.showModal();
    } else if (!message && dialog.open) {
      dialog.close();
    }
  }, [message]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto rounded-xl border border-gray-200 p-0 shadow-lg backdrop:bg-black/40"
    >
      <div className="w-80 max-w-full space-y-4 p-6">
        <h2 className="text-base font-semibold text-gray-900">Sign in failed</h2>
        <p className="text-sm text-gray-600">{message}</p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            OK
          </button>
        </div>
      </div>
    </dialog>
  );
}

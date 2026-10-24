import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import EditUserDialog from "./EditUserDialog";
import { axiosErrorWithStatus } from "@/test/axios-error";

// The dialog never calls the API itself; the form it mounts does. The refused
// save below needs that call to fail, which is the only reason this is here.
vi.mock("@/lib/api", () => ({ api: { patch: vi.fn() } }));

// Why this file exists when EditUserForm.test.tsx covers every branch inside
// the form: the dialog owns a guarantee the form cannot state on its own.
// Radix unmounts DialogContent on close, so each open mounts a new useForm and
// re-reads defaultValues from the `user` prop as it is *then*.
//
// For the create dialog that guarantee is "starts blank". Here it is stronger
// and worth more: the fields have to show the row, so a form that survived a
// close would keep showing a row as it was before the last refetch — or keep
// an abandoned edit and offer to save it. Lift the useForm call into this
// component, or add forceMount to DialogContent, and both tests below go red
// while nothing else in the suite notices.
//
// fireEvent, not userEvent: Radix sets pointer-events:none on the body while a
// dialog is open, which userEvent refuses to click through and fireEvent does
// not consult.
const ORIGINAL = {
  id: "u1",
  name: "Original Name",
  email: "original@test.local",
};

function renderDialog(user = ORIGINAL) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <EditUserDialog user={user} />
    </QueryClientProvider>,
  );
}

// The trigger has no text, so its accessible name is the aria-label — which
// carries the row's name precisely so one row's button can be told from
// another's.
function openDialog(name = ORIGINAL.name) {
  fireEvent.click(screen.getByRole("button", { name: `Edit ${name}` }));
}

// shadcn's DialogContent renders the corner X with an sr-only "Close", and
// DialogFooter's own close button is off by default, so there is exactly one.
async function closeDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
}

beforeEach(() => {
  vi.mocked(api.patch).mockReset();
});

describe("EditUserDialog", () => {
  it("mounts nothing until the trigger is clicked", () => {
    renderDialog();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    openDialog();

    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("forgets an abandoned edit, and the error from a refused save", async () => {
    vi.mocked(api.patch).mockRejectedValue(axiosErrorWithStatus(409));
    renderDialog();

    openDialog();
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "someone.else@test.local" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "brandnew98765" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("That email address is already in use."),
    ).toBeVisible();

    await closeDialog();
    openDialog();

    // Back to the row, not to what was typed at it.
    expect(screen.getByLabelText("Email")).toHaveValue(ORIGINAL.email);
    expect(screen.getByLabelText("New password")).toHaveValue("");
    expect(
      screen.queryByText("That email address is already in use."),
    ).not.toBeInTheDocument();
  });

  // The edit-only half of the same guarantee: the prefill is read on every
  // mount, so a row that changed while the dialog was shut opens showing the
  // new values. A useForm that outlived the close would still be showing the
  // old ones, and saving would write them back.
  it("re-reads the row each time it opens", async () => {
    renderDialog();

    openDialog();
    expect(screen.getByLabelText("Name")).toHaveValue(ORIGINAL.name);
    await closeDialog();

    const renamed = { ...ORIGINAL, name: "Renamed Elsewhere" };
    renderDialog(renamed);
    openDialog(renamed.name);

    expect(screen.getByLabelText("Name")).toHaveValue("Renamed Elsewhere");
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import DeleteUserDialog from "./DeleteUserDialog";
import { axiosErrorWithStatus } from "@/test/axios-error";

vi.mock("@/lib/api", () => ({ api: { delete: vi.fn() } }));

// Deliberately NOT a copy of CreateUserDialog.test.tsx. That file exists to
// prove a form is thrown away on close; an AlertDialog holds no form and no
// draft, so a "starts blank" test here would pass against anything.
//
// What this file owns instead: the two answers the real stack will not give on
// demand — a refused delete — and the cache key, whose failure is silent (the
// row really is deleted, the table just goes on showing it).
//
// fireEvent, not userEvent: Radix sets pointer-events:none on the body while a
// dialog is open, which userEvent refuses to click through.
const USER = { id: "u1", name: "Gone Agent" };

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

  render(
    <QueryClientProvider client={queryClient}>
      <DeleteUserDialog user={USER} />
    </QueryClientProvider>,
  );

  return { invalidateQueries };
}

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: `Delete ${USER.name}` }));
}

// `name` matches the whole accessible name, so this finds the confirm button
// and not the row's trigger, which reads "Delete Gone Agent".
function confirm() {
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
}

beforeEach(() => {
  vi.mocked(api.delete).mockReset();
});

describe("DeleteUserDialog", () => {
  it("asks before it deletes anything", () => {
    renderDialog();

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    openDialog();

    expect(screen.getByRole("alertdialog")).toBeVisible();
    // Still nothing sent — the dialog is the question, not the action.
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("does not delete when the dialog is cancelled", async () => {
    renderDialog();

    openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("deletes and refreshes the roster", async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: {} } as AxiosResponse);
    const { invalidateQueries } = renderDialog();

    openDialog();
    confirm();

    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith(`/api/users/${USER.id}`),
    );
    // The same key UsersPage reads. Name a different one and the row stays on
    // screen as if nothing happened, while the server really did delete it.
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["users"] });
  });

  // The dialog has to stay up while the request is unanswered — that is the
  // only place the pending state is visible, and it is what
  // `event.preventDefault()` on the confirm button buys. Radix closes on click
  // otherwise, and the state would never be seen.
  //
  // The request has to be held open to observe it at all: a resolved mock is
  // already past it before an assertion could run.
  it("keeps the dialog up, and takes one click, while the delete is unanswered", async () => {
    let release: (response: AxiosResponse) => void = () => {};
    vi.mocked(api.delete).mockReturnValue(
      new Promise<AxiosResponse>((resolve) => {
        release = resolve;
      }),
    );
    renderDialog();

    openDialog();
    confirm();

    const pending = await screen.findByRole("button", { name: "Deleting…" });
    expect(pending).toBeDisabled();
    expect(screen.getByRole("alertdialog")).toBeVisible();

    // A click the browser would not deliver to a disabled button, so this only
    // proves the state is real rather than re-testing the DOM. A second DELETE
    // would be answered 200 either way — the endpoint is idempotent — so what
    // this guards is the dialog staying put, not a duplicate write.
    fireEvent.click(pending);
    expect(api.delete).toHaveBeenCalledOnce();

    release({ data: {} } as AxiosResponse);

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
  });

  it("reports a refused delete without stacking two dialogs", async () => {
    vi.mocked(api.delete).mockRejectedValue(axiosErrorWithStatus(403));
    renderDialog();

    openDialog();
    confirm();

    expect(
      await screen.findByText("Could not delete the user. Please try again."),
    ).toBeVisible();
    // The confirmation is gone before the report appears: two Radix portals
    // open at once fight over one focus trap.
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

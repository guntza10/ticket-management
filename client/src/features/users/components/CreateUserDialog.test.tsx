import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import CreateUserDialog from "./CreateUserDialog";
import { axiosErrorWithStatus } from "@/test/axios-error";

// The dialog never calls the API itself. The form it mounts does, and the test
// that reopens the dialog after a refused create has to be able to make that
// refusal happen.
vi.mock("@/lib/api", () => ({ api: { post: vi.fn() } }));

// Why this file exists when CreateUserForm.test.tsx already covers every branch
// inside the form: the dialog owns one guarantee the form cannot state on its
// own. Radix unmounts DialogContent on close, so each open mounts a new
// useForm and starts blank — which is why CreateUserForm has no reset() and
// why nothing clears a stale error by hand.
//
// Nothing else proves it. create-user.spec.ts opens the dialog in three tests
// but never twice within one, so a form that held its state across a close
// would pass the entire E2E suite. Moving the useForm call up into the dialog,
// or adding forceMount to keep the content alive, would break this and leave
// every other test green.
//
// fireEvent, not userEvent, is what makes a Radix dialog testable in jsdom:
// Radix sets pointer-events:none on the body while the dialog is open, and
// userEvent refuses to dispatch a click through that, while fireEvent does not
// consult it.
function renderDialog() {
  // Fresh per test for the same reason as everywhere else — a shared cache
  // would let one test answer the next one's query.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <CreateUserDialog />
    </QueryClientProvider>,
  );
}

// "Create user" is the trigger, "Create" is the submit button inside. Testing
// Library matches an accessible name as a whole string, so these two never
// collide here — unlike Playwright, where the substring match is why
// create-user.spec.ts has to pass `exact`.
function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Create user" }));
}

// The X in the corner: shadcn's DialogContent renders it with an sr-only
// "Close", and DialogFooter's own close button is off by default, so there is
// exactly one.
async function closeDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
}

beforeEach(() => {
  vi.mocked(api.post).mockReset();
});

describe("CreateUserDialog", () => {
  it("mounts nothing until the trigger is clicked", () => {
    renderDialog();

    // Not a hidden dialog — no dialog. The form, its state and its validation
    // do not exist yet, which is what makes the first open indistinguishable
    // from every later one.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();

    openDialog();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("");
  });

  it("forgets what was typed when it is closed and opened again", async () => {
    renderDialog();

    openDialog();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Half Typed" },
    });
    expect(screen.getByLabelText("Name")).toHaveValue("Half Typed");

    await closeDialog();
    openDialog();

    // An abandoned draft reappearing would be bad enough on its own; the real
    // cost is an admin creating an account from fields they thought were empty.
    expect(screen.getByLabelText("Name")).toHaveValue("");
  });

  it("does not bring back the error from a refused create", async () => {
    vi.mocked(api.post).mockRejectedValue(axiosErrorWithStatus(409));
    renderDialog();

    openDialog();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Duplicate" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "taken@test.local" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    const taken = "That email address is already in use.";
    expect(await screen.findByText(taken)).toBeInTheDocument();

    await closeDialog();
    openDialog();

    // setError is never cleared by hand — this is the mechanism that stands in
    // for it. A fresh dialog accusing a brand-new address of being taken is the
    // failure, and it reads as an API answer rather than a leftover.
    expect(screen.queryByText(taken)).not.toBeInTheDocument();
  });
});

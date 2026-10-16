import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import CreateUserForm from "@/components/CreateUserForm";

// The one boundary this form talks to. Faking it is what buys the two answers a
// running server will not give on request: a taken address and a plain failure.
vi.mock("@/lib/api", () => ({ api: { post: vi.fn() } }));

// The form is tested on its own, not through CreateUserDialog. Radix sets
// pointer-events:none on the body while a dialog is open, which is the usual
// way jsdom dialog tests turn flaky — and opening and closing proves nothing
// the E2E spec does not already prove in a real browser. Every branch worth
// testing lives in here.

// The form reads only `response.status`, so the rest of an AxiosError is noise.
// It has to be a real AxiosError, though: isAxiosError checks a flag the class
// sets, and a plain Error would fall through to the generic message.
function axiosErrorWithStatus(status: number) {
  return new AxiosError(
    `Request failed with status code ${status}`,
    String(status),
    undefined,
    undefined,
    { status } as AxiosResponse,
  );
}

function succeeds() {
  vi.mocked(api.post).mockResolvedValue({ data: { user: {} } } as AxiosResponse);
}

function renderForm() {
  // Fresh per test, same reason as everywhere else: a shared cache would let
  // one test answer the next one's query.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
  const onCreated = vi.fn();

  render(
    <QueryClientProvider client={queryClient}>
      <CreateUserForm onCreated={onCreated} />
    </QueryClientProvider>,
  );

  return { invalidateQueries, onCreated };
}

// getByLabelText, not getByRole("textbox"): an input[type=password] has no
// implicit ARIA role, so the role query finds nothing for the password field.
// (Playwright's own role engine is more forgiving, which is why the E2E
// helpers can ask for a textbox there and this cannot.)
function fillForm({
  name = "New Hire",
  email = "New.Hire@Test.LOCAL",
  password = "password1234",
} = {}) {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: password },
  });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
}

beforeEach(() => {
  vi.mocked(api.post).mockReset();
});

// Nothing here should ever reach the network — that is the point of validating
// on this side at all.
describe("CreateUserForm — before it calls the API", () => {
  it("refuses a password shorter than 8 characters and never calls the API", async () => {
    renderForm();

    fillForm({ password: "1234567" });
    submit();

    expect(
      await screen.findByText("Password must be at least 8 characters."),
    ).toBeVisible();
    // The point of validating here at all: the request is never made.
    expect(api.post).not.toHaveBeenCalled();
  });

  it("requires a name and a real email before calling the API", async () => {
    renderForm();

    fillForm({ name: "   ", email: "not-an-email" });
    submit();

    expect(await screen.findByText("Name is required.")).toBeVisible();
    expect(screen.getByText("Enter a valid email address.")).toBeVisible();
    expect(api.post).not.toHaveBeenCalled();
  });

});

describe("CreateUserForm — after it calls the API", () => {
  it("sends exactly name, email and password, with the email lowercased", async () => {
    succeeds();
    renderForm();

    fillForm();
    submit();

    // An exact object, so a stray `role` key in the payload fails here — the
    // server would ignore one, but the form has no business sending it. The
    // lowercasing matters because /sign-in/email looks a user up by the
    // lowercase address.
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/api/users", {
        name: "New Hire",
        email: "new.hire@test.local",
        password: "password1234",
      }),
    );
  });

  it("shows the email as already taken when the API answers 409", async () => {
    vi.mocked(api.post).mockRejectedValue(axiosErrorWithStatus(409));
    const { onCreated } = renderForm();

    fillForm();
    submit();

    expect(
      await screen.findByText("That email address is already in use."),
    ).toBeVisible();
    // Still on the form, so the address can be corrected where it was typed.
    expect(screen.getByLabelText("Email")).toBeVisible();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("shows a generic message when the request fails for another reason", async () => {
    vi.mocked(api.post).mockRejectedValue(axiosErrorWithStatus(500));
    const { onCreated } = renderForm();

    fillForm();
    submit();

    expect(
      await screen.findByText("Could not create the user. Please try again."),
    ).toBeVisible();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("refreshes the roster and closes once the user is created", async () => {
    succeeds();
    const { invalidateQueries, onCreated } = renderForm();

    fillForm();
    submit();

    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
    // The same key UsersPage queries with — name a different one and the table
    // keeps showing the roster from before the create.
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["users"] });
  });

  // Guards the `return` in the mutation's onSuccess, which is the difference
  // between the dialog closing onto a table that already holds the new row and
  // closing in a race with the refetch. Nothing else catches it: the test above
  // sees both calls happen whichever way round they go, and Playwright retries
  // its assertions long enough that a late row still passes. The gate below is
  // what makes the ordering observable — hold the refetch open and the form
  // must not report success yet.
  it("waits for the roster to refetch before reporting success", async () => {
    succeeds();
    const { invalidateQueries, onCreated } = renderForm();

    let releaseRefetch = () => {};
    invalidateQueries.mockReturnValue(
      new Promise<void>((resolve) => {
        releaseRefetch = resolve;
      }),
    );

    fillForm();
    submit();

    await waitFor(() => expect(invalidateQueries).toHaveBeenCalled());
    // Still open: onSuccess returned the invalidation, so the mutation has not
    // settled. Drop that `return` and this line is where it shows.
    expect(onCreated).not.toHaveBeenCalled();

    releaseRefetch();

    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
  });
});

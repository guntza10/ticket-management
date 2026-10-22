import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import CreateUserForm from "./CreateUserForm";
import { axiosErrorWithStatus } from "@/test/axios-error";

// The one boundary this form talks to. Faking it is what buys the three answers
// a running server will not give on request: a taken address, a plain failure,
// and a request that never comes back.
vi.mock("@/lib/api", () => ({ api: { post: vi.fn() } }));

// The form is rendered on its own here, without CreateUserDialog around it.
// Every branch below is the form's own, and wrapping each test in the dialog
// would only add Radix's open state to reach the same markup.
//
// What the dialog contributes is the one guarantee this file cannot state —
// that closing it throws the form away, so the next open starts blank. That
// lives with the dialog, in CreateUserDialog.test.tsx.

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
  // The only thing between an impatient second click and a second POST: Better
  // Auth's rate limiter covers /api/auth/* only, so nothing on the server
  // throttles this route. The duplicate would come back 409 and surface as
  // "already in use" on a form that had just succeeded — the most confusing
  // answer possible to a request that was not wrong.
  //
  // The request has to be held open to see it at all: the disabled state exists
  // only for as long as the call is unanswered, and a resolved mock is already
  // past it by the time an assertion could run.
  it("will not take a second submit while the first is unanswered", async () => {
    let releasePost: (response: AxiosResponse) => void = () => {};
    vi.mocked(api.post).mockReturnValue(
      new Promise<AxiosResponse>((resolve) => {
        releasePost = resolve;
      }),
    );
    renderForm();

    fillForm();
    submit();

    // The label is part of the guard, not decoration — while the request is
    // outstanding it is the only sign the click registered at all. Asking for
    // the button by that name is therefore the assertion, not a lookup.
    const button = await screen.findByRole("button", { name: "Creating…" });
    expect(button).toBeDisabled();

    // A click the browser would never deliver to a disabled button, so this
    // only proves the state is real rather than re-testing the DOM.
    fireEvent.click(button);
    expect(api.post).toHaveBeenCalledOnce();

    releasePost({ data: { user: {} } } as AxiosResponse);

    // And it is a state, not a one-way latch: the button has to come back for
    // the error paths above, where the dialog stays open to be corrected.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Create" })).toBeEnabled(),
    );
  });

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
    const email = screen.getByLabelText("Email");
    expect(email).toBeVisible();
    // shouldFocus: the cursor is already in the field that has to change,
    // instead of staying on the submit button that was just pressed.
    expect(email).toHaveFocus();
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

});

// Split on the seam that means something: everything above is about what the
// server answered, everything here is about what happens once it answered yes.
describe("CreateUserForm — once the user is created", () => {
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

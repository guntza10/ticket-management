import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import EditUserForm from "./EditUserForm";
import { axiosErrorWithStatus } from "@/test/axios-error";

// The one boundary this form talks to. Faking it buys the answers a running
// server will not give on request — a taken address and a plain failure — and,
// more importantly here, it is the only way to read the request body that was
// actually built.
vi.mock("@/lib/api", () => ({ api: { patch: vi.fn() } }));

// The row this form is opened on. Edit's whole premise is that the fields start
// as the row rather than empty, so every test needs something to compare
// against.
const USER = {
  id: "u1",
  name: "Original Name",
  email: "original@test.local",
};

function succeeds() {
  vi.mocked(api.patch).mockResolvedValue({
    data: { user: {} },
  } as AxiosResponse);
}

function renderForm() {
  // Fresh per test: a shared cache would let one test answer the next one's
  // query.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
  const onSaved = vi.fn();

  render(
    <QueryClientProvider client={queryClient}>
      <EditUserForm user={USER} onSaved={onSaved} />
    </QueryClientProvider>,
  );

  return { invalidateQueries, onSaved };
}

// getByLabelText, not getByRole("textbox"): an input[type=password] has no
// implicit ARIA role, so the role query finds nothing for the password field.
function nameField() {
  return screen.getByLabelText("Name");
}
function emailField() {
  return screen.getByLabelText("Email");
}
function passwordField() {
  return screen.getByLabelText("New password");
}
function saveButton() {
  return screen.getByRole("button", { name: "Save" });
}

function type(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } });
}

function submit() {
  fireEvent.click(saveButton());
}

// What actually travels to the server. The payload object still carries a
// `password` key holding undefined, and it is JSON.stringify that drops it —
// so asserting on the object as handed to axios would not prove the body is
// clean. Round-tripping it through JSON is the only way to see what the server
// will receive.
function bodyOfFirstPatch() {
  const call = vi.mocked(api.patch).mock.calls[0];
  if (!call) throw new Error("api.patch was never called");
  return JSON.parse(JSON.stringify(call[1])) as unknown;
}

beforeEach(() => {
  vi.mocked(api.patch).mockReset();
});

describe("EditUserForm — the row it opened on", () => {
  it("prefills the fields from the user it was given", () => {
    renderForm();

    expect(nameField()).toHaveValue(USER.name);
    expect(emailField()).toHaveValue(USER.email);
    // Nothing to prefill it with — the database holds a hash — and blank is
    // also what this form reads as "leave the password alone".
    expect(passwordField()).toHaveValue("");
  });

  // The reason useForm is given defaultValues at all: isDirty compares against
  // them. Without them every freshly opened form would count as changed, and
  // Save would invite a PATCH that writes the row back exactly as it was.
  it("keeps Save disabled until something actually changes", () => {
    renderForm();

    expect(saveButton()).toBeDisabled();

    type(nameField(), "Renamed");

    expect(saveButton()).toBeEnabled();
  });
});

describe("EditUserForm — the password field", () => {
  // The rule the whole feature turns on. Hashing is why: the server hashes
  // whatever it is sent, and a second hash of the same string is a different
  // hash, so "leave the password alone" has to travel as an absent field. A
  // body carrying password:"" would be a password change to the empty string.
  it("leaves password out of the request when the field is left blank", async () => {
    succeeds();
    renderForm();

    type(nameField(), "Renamed");
    submit();

    await waitFor(() => expect(api.patch).toHaveBeenCalledOnce());
    expect(vi.mocked(api.patch).mock.calls[0]?.[0]).toBe("/api/users/u1");
    // An exact object: a `password` key of any value fails here, and so would
    // a stray `role` or `id`.
    expect(bodyOfFirstPatch()).toEqual({
      name: "Renamed",
      email: "original@test.local",
    });
  });

  it("sends the password when one is typed", async () => {
    succeeds();
    renderForm();

    type(passwordField(), "brandnew98765");
    submit();

    await waitFor(() => expect(api.patch).toHaveBeenCalledOnce());
    expect(bodyOfFirstPatch()).toEqual({
      name: "Original Name",
      email: "original@test.local",
      password: "brandnew98765",
    });
  });

  // Blank is exempt from the length rule; anything else is not. The two live in
  // one chain in updateUserSchema — a .min(8) written in front of the transform
  // would reject the blank field instead, which is the mistake this guards.
  it("refuses a typed password shorter than 8 characters and never calls the API", async () => {
    renderForm();

    type(passwordField(), "1234567");
    submit();

    expect(
      await screen.findByText("Password must be at least 8 characters."),
    ).toBeVisible();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("still requires a name and a real email", async () => {
    renderForm();

    type(nameField(), "   ");
    type(emailField(), "not-an-email");
    submit();

    expect(await screen.findByText("Name is required.")).toBeVisible();
    expect(screen.getByText("Enter a valid email address.")).toBeVisible();
    expect(api.patch).not.toHaveBeenCalled();
  });
});

describe("EditUserForm — when the server refuses", () => {
  it("shows the email as already taken when the API answers 409", async () => {
    vi.mocked(api.patch).mockRejectedValue(axiosErrorWithStatus(409));
    const { onSaved } = renderForm();

    type(emailField(), "someone.else@test.local");
    submit();

    expect(
      await screen.findByText("That email address is already in use."),
    ).toBeVisible();
    // Still on the form, with the cursor already in the field that has to
    // change rather than on the button that was just pressed.
    expect(emailField()).toBeVisible();
    expect(emailField()).toHaveFocus();
    expect(onSaved).not.toHaveBeenCalled();
  });

  // Includes the 404 a row deleted in another tab would answer with: there is
  // no field for "this user is gone", so it reads as form-level.
  it("shows a generic message when the request fails for another reason", async () => {
    vi.mocked(api.patch).mockRejectedValue(axiosErrorWithStatus(404));
    const { onSaved } = renderForm();

    type(nameField(), "Renamed");
    submit();

    expect(
      await screen.findByText("Could not save the changes. Please try again."),
    ).toBeVisible();
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("EditUserForm — once the changes are saved", () => {
  it("refreshes the roster and closes", async () => {
    succeeds();
    const { invalidateQueries, onSaved } = renderForm();

    type(nameField(), "Renamed");
    submit();

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    // The same key UsersPage queries with — name a different one and the table
    // keeps showing the name from before the edit.
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["users"] });
  });

  // Guards the `return` in this hook's onSuccess, the same way
  // CreateUserForm.test.tsx guards its own. It is a separate hook with its own
  // onSuccess, so the other file's test says nothing about this one — and
  // without the return the dialog closes in a race with the refetch, leaving
  // the old name on screen for however long the roster takes.
  it("waits for the roster to refetch before reporting success", async () => {
    succeeds();
    const { invalidateQueries, onSaved } = renderForm();

    let releaseRefetch = () => {};
    invalidateQueries.mockReturnValue(
      new Promise<void>((resolve) => {
        releaseRefetch = resolve;
      }),
    );

    type(nameField(), "Renamed");
    submit();

    await waitFor(() => expect(invalidateQueries).toHaveBeenCalled());
    expect(onSaved).not.toHaveBeenCalled();

    releaseRefetch();

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  });
});

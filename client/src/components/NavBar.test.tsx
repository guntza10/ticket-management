import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signOut, useSession } from "@/lib/auth-client";
import NavBar from "@/components/NavBar";

// The only boundary this component has. Faking it buys the one answer a running
// server will not give on request: a sign-out it refuses.
vi.mock("@/lib/auth-client", () => ({
  signOut: vi.fn(),
  useSession: vi.fn(),
}));

type SignOutResult = Awaited<ReturnType<typeof signOut>>;

// better-auth's client resolves with { data, error } instead of throwing, so a
// refusal is a resolved value — which is exactly why ignoring it is so easy.
function signOutFails(message?: string) {
  vi.mocked(signOut).mockResolvedValue({
    data: null,
    error: { message },
  } as SignOutResult);
}

const LOGIN = "login page";

// NavBar navigates on success, so the test needs somewhere for it to land —
// otherwise "did not navigate" and "navigated nowhere readable" look the same.
//
// Signed in as an *agent* deliberately: the admin-only Users link has nothing to
// do with signing out, and stubbing an admin would make every test here depend
// on that link rendering, so a break in it would fail all of them for an
// unrelated reason. Both of its states are proven against a real browser
// instead — route-protection.spec.ts asserts an admin sees the link and an agent
// does not, and create-user.spec.ts re-checks it for a freshly created agent.
function renderNavBar() {
  vi.mocked(useSession).mockReturnValue({
    data: { user: { name: "Nina Agent", role: "agent" } },
    isPending: false,
  } as ReturnType<typeof useSession>);

  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<NavBar />} />
        <Route path="/login" element={<p>{LOGIN}</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function clickLogOut() {
  fireEvent.click(screen.getByRole("button", { name: "Log out" }));
}

describe("NavBar — signing out", () => {
  beforeEach(() => {
    vi.mocked(signOut).mockReset();
    vi.mocked(useSession).mockReset();
  });

  it("reports a refused sign-out and keeps the user where they are", async () => {
    signOutFails("Session already revoked.");
    renderNavBar();

    clickLogOut();

    expect(
      await screen.findByRole("heading", { name: "Sign out failed" }),
    ).toBeVisible();
    expect(screen.getByText("Session already revoked.")).toBeVisible();
    // The point of reading `error` at all. Navigating here would land on
    // /login, which redirects a still-signed-in visitor back to "/" — a click
    // that appears to do nothing.
    expect(screen.queryByText(LOGIN)).toBeNull();

    // The nav is only asserted after the dialog closes: Radix marks everything
    // behind an open modal aria-hidden, so a role query cannot see the button
    // until then. Dismissing is what proves the user is still on this page
    // rather than looking at a dialog over a blank route.
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    expect(await screen.findByRole("button", { name: "Log out" })).toBeVisible();
    expect(screen.queryByText(LOGIN)).toBeNull();
  });

  // better-auth types `message` as `string | undefined`, so both of these are
  // inside the type and neither has anything to quote. The empty string is the
  // one that matters: under `??` it would pass through as the dialog's message,
  // and the dialog only opens on a non-empty one — so the click would report
  // nothing *and* not navigate.
  it.each([
    { quoted: "nothing at all", message: undefined },
    { quoted: "an empty string", message: "" },
  ])(
    "falls back to its own wording when the failure carries $quoted",
    async ({ message }) => {
      signOutFails(message);
      renderNavBar();

      clickLogOut();

      expect(
        await screen.findByText("Could not sign you out. Please try again."),
      ).toBeVisible();
    },
  );

  it("sends the user to the login page once the sign-out succeeds", async () => {
    vi.mocked(signOut).mockResolvedValue({
      data: {},
      error: null,
    } as SignOutResult);
    renderNavBar();

    clickLogOut();

    expect(await screen.findByText(LOGIN)).toBeVisible();
  });
});

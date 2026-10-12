import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSession } from "@/lib/auth-client";
import ProtectedRoute from "@/components/ProtectedRoute";

// The session is the only thing this component reads, so it is the only thing
// faked. Each test states what the session is and then asserts where the
// visitor ended up.
vi.mock("@/lib/auth-client", () => ({
  useSession: vi.fn(),
}));

type SessionResult = ReturnType<typeof useSession>;

// ProtectedRoute reads `data` and `isPending`; the rest of better-auth's return
// value (error, refetch) is never touched, so the cast says that out loud
// instead of fabricating fields no assertion will ever read.
function sessionReturns(value: { data: unknown; isPending: boolean }) {
  vi.mocked(useSession).mockReturnValue(value as SessionResult);
}

const LOADING = "Loading…";
const PROTECTED = "admin area";
const HOME = "home page";
const LOGIN = "login page";

// A miniature route table. A bare <ProtectedRoute> would only prove it rendered
// nothing on a redirect — not *where* it sent the visitor. With routes present,
// the destination shows up as text a test can read.
function renderAt(role?: "agent" | "admin") {
  render(
    <MemoryRouter initialEntries={["/users"]}>
      <Routes>
        <Route path="/" element={<p>{HOME}</p>} />
        <Route path="/login" element={<p>{LOGIN}</p>} />
        <Route
          path="/users"
          element={
            <ProtectedRoute role={role}>
              <p>{PROTECTED}</p>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReset();
  });

  // The state the E2E suite gave up on: in a browser it lasts well under 100ms,
  // so any assertion races the session request. Here the request simply never
  // finishes, which makes the state sit still long enough to read.
  it("waits instead of redirecting while the session is still loading", () => {
    sessionReturns({ data: null, isPending: true });

    renderAt();

    expect(screen.getByText(LOADING)).toBeVisible();
    // The real bug this guards against: redirecting before the answer arrives
    // bounces a user who *is* signed in straight back to the login page.
    expect(screen.queryByText(LOGIN)).toBeNull();
    expect(screen.queryByText(PROTECTED)).toBeNull();
  });

  it("sends a signed-out visitor to the login page", () => {
    sessionReturns({ data: null, isPending: false });

    renderAt();

    expect(screen.getByText(LOGIN)).toBeVisible();
    expect(screen.queryByText(PROTECTED)).toBeNull();
  });

  it("renders the route for a signed-in user when no role is required", () => {
    sessionReturns({ data: { user: { role: "agent" } }, isPending: false });

    renderAt();

    expect(screen.getByText(PROTECTED)).toBeVisible();
  });

  it("renders the route when the required role matches", () => {
    sessionReturns({ data: { user: { role: "admin" } }, isPending: false });

    renderAt("admin");

    expect(screen.getByText(PROTECTED)).toBeVisible();
  });

  // Home, not /login — the user is authenticated, just not authorized. Sending
  // them to a login form they have already passed reads as a broken app.
  it("sends a signed-in user without the required role home", () => {
    sessionReturns({ data: { user: { role: "agent" } }, isPending: false });

    renderAt("admin");

    expect(screen.getByText(HOME)).toBeVisible();
    expect(screen.queryByText(PROTECTED)).toBeNull();
    expect(screen.queryByText(LOGIN)).toBeNull();
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { AxiosResponse } from "axios";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import UsersPage, { type UserRow } from "@/pages/UsersPage";

// UsersPage reaches the server through this module, so a fake takes its place:
// the test, not a running API, decides what comes back. That is what buys the
// two states below that no real server hands over on request — an empty roster
// and an outright failure. Only `get` is here because only `get` is called.
vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

// NavBar renders inside UsersPage and asks this module who is signed in. The
// real one would call the auth server; this answer is fixed, so every test
// starts from the same admin session. Mocking it also keeps auth-client.ts
// itself from loading, which is why the fake above needs no API_URL.
vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ data: { user: { name: "Admin", role: "admin" } } }),
  signOut: vi.fn(),
}));

const ADMIN: UserRow = {
  id: "u1",
  name: "Admin",
  email: "admin@test.local",
  role: "admin",
  createdAt: "2026-01-15T00:00:00.000Z",
};

const AGENT: UserRow = {
  id: "u2",
  name: "Agent",
  email: "agent@test.local",
  role: "agent",
  createdAt: "2026-02-20T00:00:00.000Z",
};

// UsersPage reads `data` and nothing else, so filling in the rest of an
// AxiosResponse (status, headers, config) would be noise. The cast states that
// rather than hiding it behind a fake response object nobody reads.
function respondWith(users: UserRow[]) {
  vi.mocked(api.get).mockResolvedValue({ data: { users } } as AxiosResponse);
}

function renderUsersPage() {
  // A fresh client per test. The real app keeps one at module scope so the
  // cache outlives components — here that is exactly what must not happen, or
  // one test's rows would answer the next test's query. `retry: false` stops
  // the failure case from burning three retries before it reports.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  // MemoryRouter is real, not mocked: NavBar's Link and NavLink need routing
  // context, and routing is cheap enough that faking it would buy nothing.
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("UsersPage", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it("holds the table's shape with placeholder rows while loading", () => {
    // A request that never settles, so the pending state stays on screen.
    vi.mocked(api.get).mockReturnValue(new Promise<AxiosResponse>(() => {}));

    renderUsersPage();

    // One header row plus three skeleton rows. The header is deliberately real
    // during loading, so arriving data replaces the placeholders in place
    // instead of shifting the layout.
    expect(screen.getAllByRole("row")).toHaveLength(4);
    expect(screen.queryByRole("cell", { name: ADMIN.email })).toBeNull();
  });

  it("renders one row per user once the roster arrives", async () => {
    respondWith([ADMIN, AGENT]);

    renderUsersPage();

    expect(await screen.findByRole("cell", { name: ADMIN.email })).toBeVisible();
    expect(screen.getByRole("cell", { name: AGENT.email })).toBeVisible();
    expect(screen.getByRole("cell", { name: ADMIN.role })).toBeVisible();
    // Header plus the two users, so the placeholder rows are gone.
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  // Unreachable from E2E: the seed always creates two accounts, so the real
  // test database is never empty.
  it("says so when the roster comes back empty", async () => {
    respondWith([]);

    renderUsersPage();

    expect(await screen.findByText("No users found.")).toBeVisible();
  });

  // Also unreachable from E2E without breaking the server on purpose.
  it("surfaces the message when the request fails", async () => {
    vi.mocked(api.get).mockRejectedValue(
      new Error("Request failed with status code 403"),
    );

    renderUsersPage();

    expect(
      await screen.findByText("Request failed with status code 403"),
    ).toBeVisible();
    // A first load has no rows to keep, so the table is not rendered at all.
    expect(screen.queryByRole("table")).toBeNull();
  });
});

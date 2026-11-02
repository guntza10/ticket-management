import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { AxiosResponse } from "axios";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import type { UserRow } from "@/features/users/api/get-users";
import UsersPage from "@/pages/UsersPage";

// UsersPage reaches the server through this module, so a fake takes its place:
// the test, not a running API, decides what comes back. That is what buys the
// failure below that no real server hands over on request. `post` and `patch`
// are here because the page renders CreateUserDialog and one EditUserDialog per
// row, whose forms reach the same module — no test below triggers either, but a
// fake should describe what the subtree can call.
vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

// NavBar renders inside UsersPage and asks this module who is signed in. The
// real one would call the auth server; this answer is fixed, so every test
// starts from the same admin session. Mocking it also keeps auth-client.ts
// itself from loading, which is why the fake above needs no API_URL.
vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ data: { user: { name: "Admin", role: "admin" } } }),
  signOut: vi.fn(),
}));

const AGENT: UserRow = {
  id: "u2",
  name: "Agent",
  email: "agent@test.local",
  role: "agent",
  createdAt: "2026-02-20T00:00:00.000Z",
  deletedAt: null,
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

// What the table decides — the loading shape, the empty row, the column count —
// is asserted in UsersTable.test.tsx, with props instead of a faked request.
// What is left here is what only the page can answer: that the roster it
// fetched reaches the table at all, and what it does with a failure.
describe("UsersPage", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it("hands the roster it fetched to the table", async () => {
    respondWith([AGENT]);

    renderUsersPage();

    // Proves the whole chain: useUsers → the page's props → UsersTable → a row.
    expect(await screen.findByRole("cell", { name: AGENT.email })).toBeVisible();
    expect(screen.getByRole("cell", { name: AGENT.role })).toBeVisible();
  });

  // Unreachable from E2E without breaking the server on purpose.
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

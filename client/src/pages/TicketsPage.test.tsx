import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { AxiosResponse } from "axios";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import type { TicketRow } from "@/features/tickets/api/get-tickets";
import TicketsPage from "@/pages/TicketsPage";

// The page reaches the server through this module, so a fake takes its place:
// the test, not a running API, decides what comes back. That is what buys the
// failed-request case below, which no real server hands over on request.
vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

// NavBar renders inside TicketsPage and asks this module who is signed in.
// Answered as an **agent**, not an admin, on purpose: the page and the endpoint
// behind it are open to both roles, and a test that only ever ran as an admin
// could not tell that from the opposite.
vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ data: { user: { name: "Agent", role: "agent" } } }),
  signOut: vi.fn(),
}));

const TICKET: TicketRow = {
  id: 1,
  subject: "Cannot reset my password",
  status: "open",
  category: null,
  senderName: "Ana Ruiz",
  senderEmail: "ana.ruiz@example.com",
  createdAt: "2026-02-20T00:00:00.000Z",
};

// The page reads `data` and nothing else, so filling in the rest of an
// AxiosResponse would be noise. The cast states that rather than hiding it
// behind a fake response object nobody reads.
function respondWith(tickets: TicketRow[]) {
  vi.mocked(api.get).mockResolvedValue({ data: { tickets } } as AxiosResponse);
}

function renderTicketsPage() {
  // A fresh client per test. The real app keeps one at module scope so the
  // cache outlives components — here that is exactly what must not happen, or
  // one test's rows would answer the next test's query. `retry: false` stops
  // the failure case from burning three retries before it reports.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TicketsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// What the table decides — the three bodies, the column count — is asserted in
// TicketsTable.test.tsx with props instead of a faked request. What is left
// here is what only the page can answer: that the list it fetched reaches the
// table at all, and what it does with a failure.
describe("TicketsPage", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it("hands the list it fetched to the table", async () => {
    respondWith([TICKET]);

    renderTicketsPage();

    // Proves the whole chain: useTickets → the page's props → TicketsTable →
    // a row.
    expect(
      await screen.findByRole("cell", { name: TICKET.subject }),
    ).toBeVisible();
    expect(screen.getByRole("cell", { name: "Open" })).toBeVisible();
  });

  it("asks the endpoint the list actually lives at", async () => {
    respondWith([TICKET]);

    renderTicketsPage();

    await screen.findByRole("cell", { name: TICKET.subject });
    expect(vi.mocked(api.get)).toHaveBeenCalledWith(
      "/api/tickets",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  // Unreachable from E2E without breaking the server on purpose.
  it("surfaces the message when the first load fails", async () => {
    vi.mocked(api.get).mockRejectedValue(
      new Error("Request failed with status code 401"),
    );

    renderTicketsPage();

    expect(
      await screen.findByText("Request failed with status code 401"),
    ).toBeVisible();
    // A first load has no rows to keep, so the table is not rendered at all.
    expect(screen.queryByRole("table")).toBeNull();
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import UsersTable from "./UsersTable";
import type { UserRow } from "../api/get-users";

// A row mounts the edit and delete dialogs, which reach the API module. Nothing
// below clicks anything, but a fake should describe what the subtree can call.
vi.mock("@/lib/api", () => ({
  api: { patch: vi.fn(), delete: vi.fn() },
}));

// These three states used to be asserted through UsersPage, with a faked roster
// request standing in for each one. The table is what actually decides them, so
// they belong here: two props in, three bodies out.
const AGENT: UserRow = {
  id: "u1",
  name: "Working Agent",
  email: "agent@test.local",
  role: "agent",
  createdAt: "2026-02-20T00:00:00.000Z",
  deletedAt: null,
};

const ADMIN: UserRow = {
  id: "u2",
  name: "The Admin",
  email: "admin@test.local",
  role: "admin",
  createdAt: "2026-01-15T00:00:00.000Z",
  deletedAt: null,
};

function renderTable(props: {
  users: UserRow[] | undefined;
  isPending: boolean;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <UsersTable {...props} />
    </QueryClientProvider>,
  );
}

// getAllByRole returns HTMLElement[], and noUncheckedIndexedAccess makes every
// index possibly undefined — so the header row is pulled out with a real check
// rather than an assertion that would lie if the table rendered nothing.
function splitRows() {
  const [headerRow, ...bodyRows] = screen.getAllByRole("row");
  if (!headerRow) {
    throw new Error("the table rendered no header row");
  }
  return {
    columnCount: within(headerRow).getAllByRole("columnheader").length,
    bodyRows,
  };
}

describe("UsersTable", () => {
  // The count is the point: every other assertion here compares against it
  // rather than against a literal, so adding a column cannot leave one of the
  // three bodies behind.
  it("holds every column with placeholder rows while loading", () => {
    renderTable({ users: undefined, isPending: true });

    const { columnCount, bodyRows } = splitRows();

    expect(columnCount).toBe(5);
    expect(bodyRows).toHaveLength(3);
    for (const row of bodyRows) {
      expect(within(row).getAllByRole("cell")).toHaveLength(columnCount);
    }
  });

  it("renders one row per user once the roster arrives", () => {
    renderTable({ users: [ADMIN, AGENT], isPending: false });

    const { columnCount, bodyRows } = splitRows();

    expect(bodyRows).toHaveLength(2);
    expect(screen.getByRole("cell", { name: ADMIN.email })).toBeVisible();
    expect(screen.getByRole("cell", { name: AGENT.email })).toBeVisible();
    // A real row has to fill the header too, or the data sits under the wrong
    // headings — the same mismatch the skeleton is checked for above.
    for (const row of bodyRows) {
      expect(within(row).getAllByRole("cell")).toHaveLength(columnCount);
    }
  });

  // Unreachable from E2E: the seed always creates two accounts, so the real
  // test database is never empty.
  it("says the roster is empty across the full width of the table", () => {
    renderTable({ users: [], isPending: false });

    const { columnCount } = splitRows();

    // Asserted against the rendered headers, not against 5: a column added to
    // the header without bumping colSpan leaves this row short, which is not
    // visible in a passing render but is visible here.
    expect(screen.getByRole("cell", { name: "No users found." })).toHaveAttribute(
      "colspan",
      String(columnCount),
    );
  });
});

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
//
// Since UsersTableRow retired (2026-11-16) this file also owns what one row
// says — the second describe below. Those three cases came from
// UsersTableRow.test.tsx unchanged in substance; what was lost is reaching them
// with one prop instead of a one-element `users` array.
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

describe("UsersTable — what one row says", () => {
  // Rendering a one-element roster rather than a row component, because
  // TanStack keeps each cell's renderer in the column definition and there is
  // no row component left to aim at. `within(row)` keeps each assertion to the
  // row it is about, exactly as the row-level test did.
  function renderOneUser(user: UserRow) {
    renderTable({ users: [user], isPending: false });

    const { bodyRows } = splitRows();
    const [row] = bodyRows;
    if (!row) {
      throw new Error("the table rendered no body row");
    }
    return row;
  }

  it("shows a live user with both actions", () => {
    const row = renderOneUser(AGENT);

    expect(within(row).getByRole("cell", { name: AGENT.email })).toBeVisible();
    expect(within(row).getByRole("cell", { name: AGENT.role })).toBeVisible();
    expect(
      within(row).getByRole("button", { name: `Edit ${AGENT.name}` }),
    ).toBeVisible();
    expect(
      within(row).getByRole("button", { name: `Delete ${AGENT.name}` }),
    ).toBeVisible();
    expect(within(row).queryByText("Deleted")).not.toBeInTheDocument();
  });

  // The roster returns deleted rows on purpose, so this is the only place that
  // says what one looks like. The muting itself is not asserted: it is a class,
  // and an assertion on a class passes while the page is broken. The badge is
  // the part a person — or a screen reader — actually reads.
  it("badges a deleted user and offers nothing to do with them", () => {
    const row = renderOneUser({
      ...AGENT,
      name: "Gone Agent",
      deletedAt: "2026-03-01T00:00:00.000Z",
    });

    expect(within(row).getByText("Deleted")).toBeVisible();
    expect(within(row).queryByRole("button")).not.toBeInTheDocument();
  });

  // The UI half of a rule the server also enforces, with 403
  // admin_not_deletable. Editing an admin is still offered — only deleting is
  // refused — so this asserts both halves rather than just the absence.
  it("lets an admin be edited but not deleted", () => {
    const row = renderOneUser({ ...ADMIN, name: "The Admin" });

    expect(
      within(row).getByRole("button", { name: "Edit The Admin" }),
    ).toBeVisible();
    expect(
      within(row).queryByRole("button", { name: "Delete The Admin" }),
    ).not.toBeInTheDocument();
  });
});

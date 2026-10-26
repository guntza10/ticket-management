import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Table, TableBody } from "@/components/ui/table";
import UsersTableRow from "./UsersTableRow";
import type { UserRow } from "../api/get-users";

// The dialogs this row mounts reach the API module, so it is faked — nothing
// below clicks anything, but a fake should describe what the subtree can call.
vi.mock("@/lib/api", () => ({ api: { patch: vi.fn(), delete: vi.fn() } }));

// These three cases used to live in UsersPage.test.tsx and had to be reached
// through a page, a fake roster request and a router. The row is what actually
// decides them, so they belong here: one prop in, three answers out.
const AGENT: UserRow = {
  id: "u1",
  name: "Working Agent",
  email: "agent@test.local",
  role: "agent",
  createdAt: "2026-02-20T00:00:00.000Z",
  deletedAt: null,
};

function renderRow(user: UserRow) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  // Inside a real table: a <tr> on its own is invalid DOM, and the row's own
  // cells only have their `cell` role in that context.
  render(
    <QueryClientProvider client={queryClient}>
      <Table>
        <TableBody>
          <UsersTableRow user={user} />
        </TableBody>
      </Table>
    </QueryClientProvider>,
  );

  return screen.getByRole("row");
}

describe("UsersTableRow", () => {
  it("shows a live user with both actions", () => {
    const row = renderRow(AGENT);

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
    const row = renderRow({
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
    const row = renderRow({ ...AGENT, name: "The Admin", role: "admin" });

    expect(
      within(row).getByRole("button", { name: "Edit The Admin" }),
    ).toBeVisible();
    expect(
      within(row).queryByRole("button", { name: "Delete The Admin" }),
    ).not.toBeInTheDocument();
  });
});

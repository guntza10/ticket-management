import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Table, TableBody } from "@/components/ui/table";
import TicketsTableRow from "./TicketsTableRow";
import type { TicketRow } from "../api/get-tickets";

// The row decides two things, and both are a lookup that can be wrong on its
// own: which words a status and a category are shown as, and what stands in
// when nothing has categorised the ticket yet. One prop in, those answers out —
// no page, no faked request, no query client.
//
// No vi.mock here: unlike UsersTableRow this row mounts no dialog and reaches
// no module. A fake would describe calls the subtree cannot make.
const TICKET: TicketRow = {
  id: 1,
  subject: "Cannot reset my password",
  status: "open",
  category: "general_question",
  senderName: "Ana Ruiz",
  senderEmail: "ana.ruiz@example.com",
  createdAt: "2026-02-20T00:00:00.000Z",
};

function renderRow(ticket: TicketRow) {
  // Inside a real table: a <tr> on its own is invalid DOM, and the row's cells
  // only carry their `cell` role in that context.
  render(
    <Table>
      <TableBody>
        <TicketsTableRow ticket={ticket} />
      </TableBody>
    </Table>,
  );

  return screen.getByRole("row");
}

describe("TicketsTableRow", () => {
  it("labels a category in words rather than in its enum spelling", () => {
    const row = renderRow(TICKET);

    expect(
      within(row).getByRole("cell", { name: "General Question" }),
    ).toBeVisible();
    expect(within(row).queryByText("general_question")).not.toBeInTheDocument();
  });

  // Every ticket is uncategorised until a classifier exists, so this is the
  // common case rather than an edge one. An empty cell would read as a
  // rendering fault; the dash says "nobody has answered this yet".
  it("stands an em dash in for a ticket nobody has categorised", () => {
    const row = renderRow({ ...TICKET, category: null });

    expect(within(row).getByRole("cell", { name: "—" })).toBeVisible();
  });

  // The status the server stores is lowercase; what a person reads is not.
  // Three cases because the row has three to get right, and because a map that
  // only happens to be correct for `open` would pass with one.
  it.each([
    ["open", "Open"],
    ["resolved", "Resolved"],
    ["closed", "Closed"],
  ] as const)("shows the status %s as %s", (status, label) => {
    const row = renderRow({ ...TICKET, status });

    expect(within(row).getByRole("cell", { name: label })).toBeVisible();
  });

  // Two things are deliberately not asserted here. Which Badge variant a status
  // gets is one: that is a class, and an assertion written against markup
  // passes while the page is broken — the Record annotation on `statusVariant`
  // is what guarantees a status has *a* variant, and which one it is a person
  // judges by looking. The sender cell is the other: it renders one way for
  // every ticket, so by this repo's own rule it is markup and owes no test.
  // The E2E spec locates a row by that address, which is the proof it arrives.
});

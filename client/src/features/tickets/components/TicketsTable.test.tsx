import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TicketsTable from "./TicketsTable";
import type { TicketRow } from "../api/get-tickets";

// The table owns the one agreement this feature has: the headers, the empty
// row's colSpan and the skeleton's cell count all have to say the same number.
// The column count is pinned once, deliberately — adding a column should make
// somebody come here and agree to it. Every *other* assertion compares against
// the *rendered* header count rather than against 5, so adding a <TableHead>
// and nothing else turns all three red instead of silently shifting the layout
// in a browser.
//
// Rendered bare — no QueryClientProvider and no api fake. The table takes its
// data as props and the row it renders reaches no module, so a provider here
// would be scenery.
const OPEN_TICKET: TicketRow = {
  id: 1,
  subject: "Cannot reset my password",
  status: "open",
  category: null,
  senderName: "Ana Ruiz",
  senderEmail: "ana.ruiz@example.com",
  createdAt: "2026-02-20T00:00:00.000Z",
};

const CLOSED_TICKET: TicketRow = {
  id: 2,
  subject: "Wrong address on my shipment",
  status: "closed",
  category: "refund_request",
  senderName: "Sam Okafor",
  senderEmail: "sam.okafor@example.com",
  createdAt: "2026-02-18T00:00:00.000Z",
};

function renderTable(props: {
  tickets: TicketRow[] | undefined;
  isPending: boolean;
}) {
  render(<TicketsTable {...props} />);
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

describe("TicketsTable", () => {
  it("holds every column with placeholder rows while loading", () => {
    renderTable({ tickets: undefined, isPending: true });

    const { columnCount, bodyRows } = splitRows();

    expect(columnCount).toBe(5);
    expect(bodyRows).toHaveLength(5);
    for (const row of bodyRows) {
      expect(within(row).getAllByRole("cell")).toHaveLength(columnCount);
    }
  });

  it("renders one row per ticket once the list arrives", () => {
    renderTable({ tickets: [OPEN_TICKET, CLOSED_TICKET], isPending: false });

    const { columnCount, bodyRows } = splitRows();

    expect(bodyRows).toHaveLength(2);
    expect(
      screen.getByRole("cell", { name: OPEN_TICKET.subject }),
    ).toBeVisible();
    expect(
      screen.getByRole("cell", { name: CLOSED_TICKET.subject }),
    ).toBeVisible();
    // A real row has to fill the header too, or the data sits under the wrong
    // headings — the same mismatch the skeleton is checked for above.
    for (const row of bodyRows) {
      expect(within(row).getAllByRole("cell")).toHaveLength(columnCount);
    }
  });

  // Unreachable from E2E, in both databases: five workers share one test
  // database and the other ticket specs insert rows, and the dev database stops
  // being empty the moment anyone smoke-tests the page.
  it("says the list is empty across the full width of the table", () => {
    renderTable({ tickets: [], isPending: false });

    const { columnCount } = splitRows();

    expect(
      screen.getByRole("cell", { name: "No tickets found." }),
    ).toHaveAttribute("colspan", String(columnCount));
  });

  // The server decides the order and the table must not re-decide it. Asserted
  // on two rows this test supplies itself, so it says "the order given is the
  // order rendered" without asserting anything about a real roster.
  it("renders tickets in the order it was given", () => {
    renderTable({ tickets: [CLOSED_TICKET, OPEN_TICKET], isPending: false });

    const { bodyRows } = splitRows();
    const subjects = bodyRows.map(
      (row) => within(row).getAllByRole("cell")[0]?.textContent,
    );

    expect(subjects).toEqual([CLOSED_TICKET.subject, OPEN_TICKET.subject]);
  });
});

import {
  functionalUpdate,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PAGE_SIZE } from "../../../../../core/schemas/pagination.ts";
import TicketsTable from "./TicketsTable";
import type { TicketRow } from "../api/get-tickets";

// The table owns the one agreement this feature has: the headers, the empty
// row's colSpan and the skeleton's cell count all have to say the same number.
// Since the columns moved into columns.tsx all three read `getAllColumns()`, so
// they cannot drift — but the count is still pinned once, deliberately, so
// adding a column makes somebody come here and agree to it. Every *other*
// assertion compares against the *rendered* header count rather than against 5.
//
// It also owns what each cell says, which used to be TicketsTableRow's job.
// TanStack Table keeps the cell renderers in the column definitions, so there
// is no row component left to aim a test at; those three cases moved here
// rather than being dropped.
//
// Rendered bare — no QueryClientProvider and no api fake. The table takes
// everything it needs as props and reaches no module.
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

/** What the URL says when nobody has clicked a header yet. */
const NEWEST_FIRST: SortingState = [{ id: "createdAt", desc: true }];

/** What the URL says when nobody has paged: page 1, ten rows to a page. */
const FIRST_PAGE: PaginationState = { pageIndex: 0, pageSize: PAGE_SIZE };

/**
 * **`rowCount` defaults to `undefined`, which renders no footer** — the same
 * condition the real table holds it back by while the first page is in flight.
 * That is deliberate: every assertion in this file predates pagination, and
 * leaving the footer out of those renders is what makes the move to
 * `rowPaginationFeature` provably a refactor rather than something that had to
 * be re-measured. A test that wants the footer passes a `rowCount`.
 */
function renderTable(props: {
  tickets: TicketRow[] | undefined;
  isPending: boolean;
  sorting?: SortingState;
  pagination?: PaginationState;
  rowCount?: number;
}) {
  // Typed as the props they stand in for rather than bare vi.fn()s: an untyped
  // mock is assignable to nothing in particular, and `tsc -b` says so.
  const onSortingChange = vi.fn<OnChangeFn<SortingState>>();
  const onPaginationChange = vi.fn<OnChangeFn<PaginationState>>();

  render(
    <TicketsTable
      tickets={props.tickets}
      isPending={props.isPending}
      sorting={props.sorting ?? NEWEST_FIRST}
      onSortingChange={onSortingChange}
      pagination={props.pagination ?? FIRST_PAGE}
      onPaginationChange={onPaginationChange}
      rowCount={props.rowCount}
    />,
  );

  return { onSortingChange, onPaginationChange };
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
    headerRow,
    columnCount: within(headerRow).getAllByRole("columnheader").length,
    bodyRows,
  };
}

/**
 * Click a header and read back what the table asked for.
 *
 * TanStack hands `onSortingChange` a function rather than a value, the same
 * contract a React state setter has — so a test that only asserted "was
 * called" would pass while the table asked for the wrong column. Applying the
 * updater is what useTicketListQuery does with it, so this is the real answer.
 */
function sortingAfterClickingHeader(
  headerName: string,
  current: SortingState = NEWEST_FIRST,
) {
  const { onSortingChange } = renderTable({
    tickets: [OPEN_TICKET],
    isPending: false,
    sorting: current,
  });

  fireEvent.click(screen.getByRole("button", { name: headerName }));

  expect(onSortingChange).toHaveBeenCalledTimes(1);
  const [call] = onSortingChange.mock.calls;
  if (!call) throw new Error("onSortingChange was never called");

  // `functionalUpdate` is the library's own name for resolving "either the next
  // value or a function of the previous one". Written by hand here until
  // 2026-11-21, which cost two casts and an `unknown`.
  return functionalUpdate(call[0], current);
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

  // **This said "unreachable from E2E" until 2026-11-19 and filtering made that
  // false.** The reason was sound while it held — five workers share one test
  // database and the other ticket specs insert rows, and the dev database stops
  // being empty the moment anyone smoke-tests the page — but a filter that
  // matches nothing empties a full table, so `e2e/tickets-filter.spec.ts` now
  // asserts this same sentence in a real browser.
  // The case stays here anyway, and the reason is different from "E2E cannot":
  // this is where the empty body's **width** is checked against the rendered
  // header count, which is the agreement the table exists to hold. The E2E test
  // reads the words; this one reads the colSpan.
  it("says the list is empty across the full width of the table", () => {
    renderTable({ tickets: [], isPending: false });

    const { columnCount } = splitRows();

    expect(
      screen.getByRole("cell", { name: "No tickets found." }),
    ).toHaveAttribute("colspan", String(columnCount));
  });

  // The server decides the order and the table must not re-decide it. Measured
  // rather than assumed: registering `sortedRowModel` and turning
  // `manualSorting` off turns **this** test red and no other, because `sorting`
  // says newest-first while the rows are handed over oldest-first.
  //
  // Flipping `manualSorting` on its own changes nothing, and that is worth
  // knowing before trusting it: with no sorted row model on the table there is
  // nothing for it to switch off. The two go together.
  it("renders tickets in the order it was given", () => {
    renderTable({ tickets: [CLOSED_TICKET, OPEN_TICKET], isPending: false });

    const { bodyRows } = splitRows();
    const subjects = bodyRows.map(
      (row) => within(row).getAllByRole("cell")[0]?.textContent,
    );

    expect(subjects).toEqual([CLOSED_TICKET.subject, OPEN_TICKET.subject]);
  });
});

describe("TicketsTable — what each cell says", () => {
  it("labels a category in words rather than in its enum spelling", () => {
    renderTable({
      tickets: [{ ...OPEN_TICKET, category: "general_question" }],
      isPending: false,
    });

    expect(
      screen.getByRole("cell", { name: "General Question" }),
    ).toBeVisible();
    expect(screen.queryByText("general_question")).not.toBeInTheDocument();
  });

  // Every ticket is uncategorised until a classifier exists, so this is the
  // common case rather than an edge one. An empty cell would read as a
  // rendering fault; the dash says "nobody has answered this yet".
  it("stands an em dash in for a ticket nobody has categorised", () => {
    renderTable({
      tickets: [{ ...OPEN_TICKET, category: null }],
      isPending: false,
    });

    expect(screen.getByRole("cell", { name: "—" })).toBeVisible();
  });

  // The status the server stores is lowercase; what a person reads is not.
  // Three cases because there are three to get right, and because a map that
  // only happens to be correct for `open` would pass with one.
  it.each([
    ["open", "Open"],
    ["resolved", "Resolved"],
    ["closed", "Closed"],
  ] as const)("shows the status %s as %s", (status, label) => {
    renderTable({ tickets: [{ ...OPEN_TICKET, status }], isPending: false });

    expect(screen.getByRole("cell", { name: label })).toBeVisible();
  });

  // Which Badge variant a status gets is deliberately not asserted: that is a
  // class, and an assertion written against markup passes while the page is
  // broken. The Record annotation on `statusVariant` is what guarantees a
  // status has *a* variant; which one it is, a person judges by looking.
});

describe("TicketsTable — asking for a different order", () => {
  // The agreement columns.tsx cannot state in types: each column's id has to be
  // a TicketSortField, because useTicketListQuery sends the clicked id as `sortBy`.
  // An id that is not one does not throw — the hook's safeParse refuses it and
  // the click does nothing — so this is the thing that catches it, one case per
  // column.
  it.each([
    ["Subject", "subject"],
    ["Sender", "senderName"],
    ["Status", "status"],
    ["Category", "category"],
    ["Created", "createdAt"],
  ])("asks for %s by the id %s", (headerName, expectedId) => {
    const next = sortingAfterClickingHeader(headerName);

    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe(expectedId);
  });

  // Both directions come from `sortDescFirst` in the column definitions. One
  // render per test, because cleanup runs between tests and not between
  // renders — two tables in one DOM and `getByRole` finds two of every header.
  it("opens a text column ascending", () => {
    const next = sortingAfterClickingHeader("Subject");

    expect(next[0]?.desc).toBe(false);
  });

  // Newest first is what a date column is usually wanted for, so its first
  // click is the one that reverses.
  it("opens the date column descending", () => {
    const next = sortingAfterClickingHeader("Created", [
      { id: "subject", desc: false },
    ]);

    expect(next[0]?.desc).toBe(true);
  });

  it("flips the direction when the sorted column is clicked again", () => {
    const next = sortingAfterClickingHeader("Created", [
      { id: "createdAt", desc: true },
    ]);

    expect(next).toEqual([{ id: "createdAt", desc: false }]);
  });

  // `enableSortingRemoval: false` is what holds this. Without it a third click
  // empties the sort, and the server has no "unordered" answer to give — the
  // hook would then fall back silently and the header would stop agreeing with
  // the rows. One entry, always.
  it("never asks for no sorted column at all", () => {
    const next = sortingAfterClickingHeader("Created", [
      { id: "createdAt", desc: false },
    ]);

    expect(next).toEqual([{ id: "createdAt", desc: true }]);
  });

  // The arrow is a class and goes unasserted for the same reason the Badge
  // variant does; `aria-sort` is the part a screen reader reads out, so it is
  // the part worth pinning.
  it("marks only the sorted column for a screen reader", () => {
    renderTable({
      tickets: [OPEN_TICKET],
      isPending: false,
      sorting: [{ id: "subject", desc: false }],
    });

    const { headerRow } = splitRows();
    const headers = within(headerRow).getAllByRole("columnheader");

    expect(headers.map((header) => header.getAttribute("aria-sort"))).toEqual([
      "ascending",
      "none",
      "none",
      "none",
      "none",
    ]);
  });
});

// The footer moved inside this component on 2026-11-21, when pagination went
// through TanStack's `rowPaginationFeature` instead of being wired to plain
// numbers. These two are the assertions that move turned on, and nothing else
// in the repo covers them: the buttons call the table's own `nextPage()`, so a
// missing `onPaginationChange` would make paging do nothing in a browser while
// every other test here stayed green.
//
// **What it does *not* say any more: that nothing else covers these.**
// `e2e/tickets-pagination.spec.ts` arrived in the same change and clicks all
// four buttons in a real browser, so a dropped `onPaginationChange` goes red
// there too. What this file adds over it is the updater's *value* — the browser
// spec can only read the URL that came out the other end, while these assert
// which page the table asked for.
//
// **What each one actually guards, measured rather than assumed** (2026-11-21):
// deleting `onPaginationChange` from the `useTable` options turns exactly the
// first red. Deleting `rowCount` turns **both** red, because without a total
// the page count is 0, so `getCanNextPage()` is false, so the Next button the
// first test clicks is disabled and the click does nothing. So the second is
// the only one that fails for `rowCount` alone, and neither test maps to one
// line — the same shape as the `?? undefined` cases in
// use-ticket-list-query.test.ts, where assuming one test per line was wrong.
describe("TicketsTable — the pagination footer", () => {
  it("asks for the next page when Next is clicked", () => {
    const { onPaginationChange } = renderTable({
      tickets: [OPEN_TICKET],
      isPending: false,
      rowCount: 25,
    });

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));

    // Applying the updater rather than asserting "was called", for the same
    // reason the sorting helper above does: TanStack hands over a function of
    // the previous state, so a test that stopped at the call count would pass
    // while the table asked for the wrong page.
    expect(onPaginationChange).toHaveBeenCalledTimes(1);
    const [call] = onPaginationChange.mock.calls;
    if (!call) throw new Error("onPaginationChange was never called");

    expect(functionalUpdate(call[0], FIRST_PAGE)).toEqual({
      pageIndex: 1,
      pageSize: PAGE_SIZE,
    });
  });

  // This is the one that proves `rowCount` reaches the table. Without it the
  // table cannot know where the list ends, `getCanNextPage()` answers from a
  // page count of 0, and the disabled edges stop meaning anything.
  it("will not page past the last page", () => {
    renderTable({
      tickets: [OPEN_TICKET],
      isPending: false,
      // 25 rows at 10 to a page is three pages, and pageIndex 2 is the last.
      pagination: { pageIndex: 2, pageSize: PAGE_SIZE },
      rowCount: 25,
    });

    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Last page" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Previous page" }),
    ).toBeEnabled();
    expect(screen.getByText("Showing 21–25 of 25")).toBeInTheDocument();
  });
});

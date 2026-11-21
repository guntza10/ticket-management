import {
  functionalUpdate,
  rowPaginationFeature,
  tableFeatures,
  useTable,
  type OnChangeFn,
  type PaginationState,
} from "@tanstack/react-table";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TablePagination from "./TablePagination";

// Hand-written rather than imported from `core/schemas/pagination.ts`, the way
// `e2e/tickets-api-pagination.spec.ts` does it and for the same reason: every
// expectation below ("Showing 11–20 of 42", "Page 2 of 5") is arithmetic on
// this number, so a file that imported it would follow the constant in one half
// and contradict it in the other. One spelling per file, and changing PAGE_SIZE
// brings somebody here to agree to the new numbers.
const PAGE_SIZE = 10;

// The footer is shared by both tables, so its own branches are tested here
// rather than twice through them. What `TicketsTable.test.tsx` and
// `UsersTable.test.tsx` still own is the *wiring* — that a table passes its
// `rowCount` and `onPaginationChange` down — which is a different claim from
// the ones below and is why neither file was emptied into this one.
//
// Rendered over a real table instance built from the real feature, because the
// component takes a table and reads six things off it. A hand-made object
// satisfying the type would be a second implementation of `getCanNextPage()`,
// and this file would then be testing that implementation.
const paginationFeatures = tableFeatures({ rowPaginationFeature });

function renderFooter({
  page,
  rowCount,
}: {
  page: number;
  rowCount: number;
}) {
  const onPaginationChange = vi.fn<OnChangeFn<PaginationState>>();
  // The URL is 1-based and the library is 0-based; the hooks convert, so a test
  // written in page numbers is a test written the way the app's URL reads.
  const pagination: PaginationState = {
    pageIndex: page - 1,
    pageSize: PAGE_SIZE,
  };

  function Harness() {
    const table = useTable({
      features: paginationFeatures,
      columns: [],
      // No rows at all, deliberately: the footer never reads them. It counts
      // with `rowCount`, which is the server's `total`, and that independence
      // is what lets it say "Showing 11–20 of 42" while holding ten rows.
      data: [],
      manualPagination: true,
      rowCount,
      state: { pagination },
      onPaginationChange,
    });

    return <TablePagination table={table} pagination={pagination} />;
  }

  render(<Harness />);

  /** The page the footer asked for, in the URL's 1-based spelling. */
  function requestedPage() {
    expect(onPaginationChange).toHaveBeenCalledTimes(1);
    const [call] = onPaginationChange.mock.calls;
    // Unreachable after the assertion above, and `noUncheckedIndexedAccess`
    // still wants it said out loud.
    if (!call) throw new Error("onPaginationChange was never called");
    // TanStack hands over either the next state or a function of the previous
    // one, and `functionalUpdate` is the library's own name for resolving that
    // pair. Resolving it is what turns "was called" into "asked for page 4" — a
    // test that stopped at the call count would pass while the button moved to
    // the wrong page. Written by hand here until 2026-11-21, which cost two
    // `as PaginationState` casts sitting exactly where the test decides whether
    // the right page was asked for.
    return functionalUpdate(call[0], pagination).pageIndex + 1;
  }

  return { requestedPage };
}

const button = (name: string) => screen.getByRole("button", { name });

describe("TablePagination", () => {
  // The empty list is the state the real stack cannot be asked for on demand
  // here: an empty roster needs a database with no users in it, which the
  // seeded test database never is.
  it("renders nothing at all when there is not a single row", () => {
    renderFooter({ page: 1, rowCount: 0 });

    // By role, not by text: "renders nothing" has to mean no controls either,
    // and a footer drawn with every button disabled would still pass a text
    // assertion about the range being absent.
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("names the rows on screen and the page they sit on", () => {
    renderFooter({ page: 2, rowCount: 42 });

    // 42 rows at ten to a page is five pages, and page two holds rows 11–20.
    // Both halves are asserted because they come from different arithmetic:
    // the range from `pageIndex * pageSize`, the count from `getPageCount()`.
    expect(screen.getByText("Showing 11–20 of 42")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();
  });

  it("stops the range at the last row on a short final page", () => {
    renderFooter({ page: 5, rowCount: 42 });

    // The arithmetic that would read "Showing 41–50 of 42" without the
    // `Math.min` — a page that is not full is the normal case for the last one.
    expect(screen.getByText("Showing 41–42 of 42")).toBeInTheDocument();
  });

  it("offers no way back from the first page", () => {
    renderFooter({ page: 1, rowCount: 42 });

    expect(button("First page")).toBeDisabled();
    expect(button("Previous page")).toBeDisabled();
    expect(button("Next page")).toBeEnabled();
    expect(button("Last page")).toBeEnabled();
  });

  it("offers no way forward from the last page", () => {
    renderFooter({ page: 5, rowCount: 42 });

    expect(button("Next page")).toBeDisabled();
    expect(button("Last page")).toBeDisabled();
    expect(button("Previous page")).toBeEnabled();
  });

  // One case per button, because each one computes a different page and three
  // of them are reachable by a mistake the others would not show: Last needs
  // the page count, First needs none of it, Previous is the only subtraction.
  it.each([
    { label: "First page", from: 4, expected: 1 },
    { label: "Previous page", from: 4, expected: 3 },
    { label: "Next page", from: 4, expected: 5 },
    { label: "Last page", from: 2, expected: 5 },
  ])("$label asks for page $expected", ({ label, from, expected }) => {
    const { requestedPage } = renderFooter({ page: from, rowCount: 42 });

    fireEvent.click(button(label));

    expect(requestedPage()).toBe(expected);
  });

  // A page past the end is reachable without typing a URL: delete the only row
  // on the last page and the page number the URL holds no longer exists.
  it("says a page past the end holds nothing, and leaves the way back open", () => {
    renderFooter({ page: 9, rowCount: 42 });

    expect(screen.getByText("No rows on page 9")).toBeInTheDocument();
    // Never "Showing 81–42 of 42", which is what the range arithmetic alone
    // would produce.
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument();
    expect(button("Previous page")).toBeEnabled();
    expect(button("Next page")).toBeDisabled();
  });
});

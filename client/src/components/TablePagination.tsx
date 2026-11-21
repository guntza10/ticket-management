import type {
  PaginationState,
  RowData,
  TableFeatures,
  Table_RowPagination,
} from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The footer under a paginated list: which rows are on screen, which page of
 * how many, and four buttons to move.
 *
 * **It reads everything off the table instance and holds no page state of its
 * own**, which is the second version of this file. The first took `page`,
 * `total` and `onPageChange` as plain numbers and did the page arithmetic
 * itself, on the reasoning that `manualPagination` leaves the library nothing
 * to decide but a `Math.ceil`. That reasoning does not survive being applied
 * to the file next door: `manualSorting` leaves the library nothing to decide
 * either — Postgres sorts the rows — and sorting goes through the instance
 * anyway, because the instance is where this table's query state lives. Two
 * mechanisms for two halves of one query is the thing worth avoiding, and it
 * is what the first version shipped.
 *
 * Two smaller claims the first version made were also wrong, and are recorded
 * because the repo's rule is to say what changed its mind:
 *   1. *"a prop typed on a table instance could not be shared at all"* — false.
 *      `Table<TFeatures, TData>` is generic in both parameters, so one
 *      component serves both tables; the two type parameters below are the
 *      whole cost. shadcn's own `DataTablePagination` is this shape.
 *   2. It imported `PAGE_SIZE` to turn a page number into a row range. The
 *      page size is in the table's own pagination state, so there is one
 *      fewer reader of that constant now rather than one more.
 *
 * **It lives in `components/` rather than in a feature because both lists use
 * it, and that is the test an abstraction has to pass here** — `UsersTable` and
 * `TicketsTable` were deliberately *not* merged into a shared `DataTable` on
 * the rule that repetition is only worth removing when the copies must change
 * together. These copies must: paging means the same thing on both lists, and
 * a change to how a page is announced — the range, the labels, the disabled
 * edges — is a change both should get. A column added to the roster still says
 * nothing about the ticket list, which is why the tables stay apart and this
 * does not.
 *
 * **The prop is typed as the pagination half of a table, not as a whole
 * table**, and that is what makes it shareable without generics at all.
 * `Table<TFeatures, TData>` assembles itself from the features that were
 * registered, so writing the prop that way needs `TFeatures` as a type
 * parameter — and a `TFeatures` that is still a parameter resolves to a
 * *union* of every possible feature set rather than to the pagination one
 * (measured: eleven `Property 'getPageCount' does not exist` errors). Naming
 * `Table_RowPagination` directly is the same requirement stated the way v9
 * can check it: a table whose `tableFeatures()` call omits
 * `rowPaginationFeature` has none of these methods and fails at the call
 * site, which is the guarantee that was wanted. Its two type parameters are
 * unused in the interface — v9 declares them `_TFeatures` / `_TData` — so
 * instantiating them with the base constraints asks for nothing.
 *
 * **`pagination` is a second prop rather than something read off the table**,
 * which is the third version of this file and the one with no library
 * internals in it. `Table_RowPagination` carries the methods and the `getCan…`
 * questions but not the state, so reading `pageIndex` meant either
 * `table.atoms.pagination.get()` — propped up by a hand-written fragment of
 * v9's atom graph in this file's own prop type — or `table.state.pagination`,
 * which v9's docs name as the *reactive* read and which needs the same
 * intersection. Both put a copy of a library internal in a component that only
 * wants two numbers, and `atoms.…get()` is documented as a snapshot for event
 * handlers that does not subscribe, which is the wrong kind of read in a render
 * path (it worked only because the state is controlled from the URL, so the
 * parent re-renders on every change).
 * Every *decision* still comes off the instance — `getPageCount`,
 * `getRowCount`, `getCanNextPage`, `nextPage` — so the "one mechanism, not two"
 * argument above is untouched. Both callers already hold this exact value: they
 * take `pagination` as a prop and hand it to `useTable`'s `state`.
 */
type PaginatedTable = Table_RowPagination<TableFeatures, RowData>;

export default function TablePagination({
  table,
  pagination,
}: {
  table: PaginatedTable;
  pagination: PaginationState;
}) {
  // The whole matching set, not this page's length: `rowCount` is passed in
  // from the server's `total`, and `getRowCount()` is what reads it back.
  const total = table.getRowCount();

  // Nothing to page through, and the table above already says so in its own
  // empty row. A footer here would be four disabled buttons under "No tickets
  // found." saying "Page 1 of 0".
  if (total === 0) return null;

  // `pageIndex` is 0-based — the library's spelling, not the URL's. It is
  // converted once, in the list hook that writes the URL, so the `+ 1` here is
  // the only other place the two spellings meet.
  const { pageIndex, pageSize } = pagination;
  const page = pageIndex + 1;
  const pageCount = table.getPageCount();
  const firstRow = pageIndex * pageSize + 1;
  const lastRow = Math.min(page * pageSize, total);

  // A page past the end is reachable two ways — somebody types `?page=9`, or
  // they delete the only row on the last page — so this says what is true
  // rather than drawing "Showing 81–42 of 42". The buttons stay rendered,
  // because the way out is Previous.
  const isPastEnd = page > pageCount;

  return (
    // A nav landmark with a name: it is a set of controls for moving through
    // the list, and a screen reader lists it by that name. `aria-label` is
    // right here, unlike on the filter dropdowns, because there is no visible
    // text that already names the group.
    <nav
      aria-label="Pagination"
      className="mt-4 flex items-center justify-between"
    >
      <p className="text-muted-foreground text-sm">
        {isPastEnd
          ? `No rows on page ${page}`
          : `Showing ${firstRow}–${lastRow} of ${total}`}
      </p>
      <div className="flex items-center gap-1">
        {/* Each button names the page it goes to rather than just "Previous",
            so the accessible name says where it lands. Icon-only buttons need
            that name spelled out — see client/CLAUDE.md.

            Both halves of every button come from the table: the handler is its
            own navigation method, and `disabled` is the matching `getCan…`.
            `getCanPreviousPage()` is `pageIndex > 0` and `getCanNextPage()` is
            `pageIndex < pageCount - 1`, so a page past the end disables Next
            and Last and leaves Previous live — which is the behaviour the
            hand-written version had, kept rather than re-decided. */}
        <Button
          variant="outline"
          size="icon"
          aria-label="First page"
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.firstPage()}
        >
          <ChevronsLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous page"
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
        >
          <ChevronLeft />
        </Button>
        <span className="px-2 text-sm">
          Page {page} of {pageCount}
        </span>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next page"
          disabled={!table.getCanNextPage()}
          onClick={() => table.nextPage()}
        >
          <ChevronRight />
        </Button>
        {/* `getCanLastPage()` rather than `getCanNextPage()`: they agree here,
            but the first also refuses an unknown or non-finite page count,
            which is the state a list that passed `pageCount: -1` would be in.
            Using the method named after the button keeps that true if this is
            ever handed such a table. */}
        <Button
          variant="outline"
          size="icon"
          aria-label="Last page"
          disabled={!table.getCanLastPage()}
          onClick={() => table.lastPage()}
        >
          <ChevronsRight />
        </Button>
      </div>
    </nav>
  );
}

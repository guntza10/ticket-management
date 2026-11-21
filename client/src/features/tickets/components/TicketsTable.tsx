import {
  useTable,
  type OnChangeFn,
  type PaginationState,
  type SortDirection,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import TablePagination from "@/components/TablePagination";
import { ticketColumns, ticketTableFeatures } from "./columns";
import type { TicketRow } from "../api/get-tickets";

// What a header announces to a screen reader. `aria-sort` has its own
// vocabulary, so the two spellings are paired here once instead of inside the
// markup, where oxlint's no-nested-ternary would be the least of it.
const ARIA_SORT: Record<SortDirection, "ascending" | "descending"> = {
  asc: "ascending",
  desc: "descending",
};

// The arrow beside a header. The unsorted case is a double chevron rather than
// nothing, so a column that *can* be sorted looks different from one that
// cannot — every column here can.
function SortIcon({ sorted }: { sorted: false | SortDirection }) {
  if (sorted === "asc") return <ArrowUp />;
  if (sorted === "desc") return <ArrowDown />;
  return <ChevronsUpDown />;
}

// The list as a table: which of its three bodies to render, a header that can
// ask for a different order, and the footer that moves between pages.
//
// Built on TanStack Table since 2026-11-13, and the version matters — v9's
// `useTable` + `<table.FlexRender>`, not v8's `useReactTable` + `flexRender()`.
// Nearly every example online is still v8.
//
// What the library is here for is **not** sorting or slicing the rows.
// `manualSorting` and `manualPagination` below both say the data arrives
// already ordered and already cut to one page; what TanStack decides is which
// column is marked sorted, which way a click flips it, how many pages the row
// count makes, and which navigation buttons are reachable. Postgres decides
// the rows, because once a list is paginated the browser only holds the page
// it can see.
//
// **The footer is rendered here rather than by the page, and that is a
// consequence rather than a preference:** `useTable` is called in this file,
// so anything reading `getPageCount()` or calling `nextPage()` has to be
// inside it. It is also the shape shadcn's own data-table has — one component
// holding the instance, the `<Table>` and the pagination controls.
//
// The agreement this file used to hold by hand — headers, the empty row's
// colSpan and the skeleton's cell count all saying the same number — is now
// `ticketColumns.length` in all three places, so there is nothing left to
// drift. The tests still compare them against the *rendered* header count
// rather than against 5, which is what follows a column that is genuinely
// added.
//
// Still not merged with UsersTable into a shared DataTable. Adopting the same
// library for both is the convention; a shared component is a different claim,
// and the test it fails is the house rule: repetition is worth removing when
// the copies **must change together**, and a column added to the roster says
// nothing about this list. `TablePagination` is the opposite case and is
// shared, because a page means the same thing on both.
export default function TicketsTable({
  tickets,
  isPending,
  sorting,
  onSortingChange,
  pagination,
  onPaginationChange,
  rowCount,
}: {
  tickets: TicketRow[] | undefined;
  isPending: boolean;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>;
  // The server's `total` — every row matching the filters, not the ten on this
  // page — under the name the table option gives it, so the chain reads
  // `data.total` → `rowCount` → `getRowCount()` with one word in the middle.
  // `undefined` while the first page is in flight, which is also the condition
  // the footer is held back by.
  rowCount: number | undefined;
}) {
  const table = useTable({
    features: ticketTableFeatures,
    columns: ticketColumns,
    data: tickets ?? [],
    // Already sorted by the server. Without this the table would re-sort what
    // it was given, and the two answers would agree only by luck.
    manualSorting: true,
    // One column at a time, and never none: the API always has a column and a
    // direction, so a "nothing is sorted" state would be a view the server
    // cannot answer. `enableSortingRemoval: false` is the one that earns its
    // place — without it a third click empties the sort, and the test
    // "never asks for no sorted column at all" is what holds it.
    //
    // This comment used to end by claiming the pair is "what lets useTicketSort
    // read `sorting[0]` without a fallback". Both halves were false:
    // useTicketSort *builds* `sorting` rather than reading it, and where it does
    // read an element it has a real guard that `noUncheckedIndexedAccess`
    // requires and a test aims at. Removed 2026-11-16 — the fourth time this
    // repo has shipped a comment promising a check that was not there.
    enableMultiSort: false,
    enableSortingRemoval: false,
    // Already cut to one page by `skip`/`take`, so the table must not cut it
    // again — `manualPagination` is what tells it the ten rows it holds *are*
    // the page. `rowCount` is the other half: without a total the table cannot
    // know how many pages there are, so `getCanNextPage()` would be guessing.
    //
    // `pageCount` is deliberately **not** passed as well, though it would be
    // derivable. It is what `setPageIndex` clamps against, so passing it would
    // make Previous from a hand-typed `?page=99` land on the last real page
    // instead of page 98 — a better behaviour, and one this change is not
    // making, because a refactor that quietly improves something cannot be
    // shown to have preserved it.
    manualPagination: true,
    rowCount,
    state: { sorting, pagination },
    onSortingChange,
    onPaginationChange,
  });

  // Read off the table rather than off `ticketColumns`, so the skeleton and the
  // empty row count the same columns the header just rendered.
  const columns = table.getAllColumns();

  return (
    <>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted();

                return (
                  // aria-sort is what a screen reader announces; the arrow is
                  // what everyone else reads. Both come from the same value.
                  <TableHead
                    key={header.id}
                    aria-sort={sorted === false ? "none" : ARIA_SORT[sorted]}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-3"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <table.FlexRender header={header} />
                      <SortIcon sorted={sorted} />
                    </Button>
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {/* Five placeholder rows — a guess at a list's length, which is fine,
              since the point is only to hold the shape until the data replaces
              it. One cell per column, each as wide as that column's meta says.

              Only the *first* load reaches this: useTickets keeps the previous
              rows on screen while a re-sort or a page change is in flight, so
              clicking a header or Next does not fall back to bars. */}
          {isPending &&
            Array.from({ length: 5 }, (_, rowIndex) => (
              <TableRow key={rowIndex}>
                {columns.map((column) => (
                  <TableCell key={column.id}>
                    <Skeleton
                      className={`h-4 ${column.columnDef.meta?.skeletonWidth ?? "w-24"}`}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          {/* colSpan is the column count rather than a literal, and is still
              asserted against the rendered headers rather than trusted.

              **This used to say the body was the one state E2E cannot stage** —
              five workers share one test database that is truncated once per run,
              and the other ticket specs insert rows, so an empty answer was not
              something a spec could ask for. Filtering made it askable on
              2026-11-19: a search for a token nobody holds, or a status no ticket
              has, is an empty answer on a full table. `e2e/tickets-filter.spec.ts`
              now asserts "No tickets found." when a status stops matching, and
              deleting this block turns that test red — measured, so the sentence
              above had to go rather than be left reading as a reason not to
              try. */}
          {tickets?.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="text-muted-foreground"
              >
                No tickets found.
              </TableCell>
            </TableRow>
          )}
          {/* Rendered in the order the server sent. The row model is the core one
              — no sorted row model and no paginated row model exist on this
              table at all. */}
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {/* Only once there is an answer to count. While the first page is in
          flight there is no total, so the footer would have to guess at a page
          count — and the skeleton above is already saying that rows are coming.
          On a *re*fetch `keepPreviousData` keeps the previous answer, so paging
          never blanks this. The guard lived in `TicketsPage` until the footer
          moved in here; it is the same condition, one layer down. */}
      {rowCount !== undefined && <TablePagination table={table} pagination={pagination} />}
    </>
  );
}

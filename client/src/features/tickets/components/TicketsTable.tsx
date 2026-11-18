import {
  useTable,
  type OnChangeFn,
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

// The list as a table: which of its three bodies to render, and a header that
// can ask for a different order.
//
// Built on TanStack Table since 2026-11-13, and the version matters — v9's
// `useTable` + `<table.FlexRender>`, not v8's `useReactTable` + `flexRender()`.
// Nearly every example online is still v8.
//
// What the library is here for is **not** sorting the rows. `manualSorting`
// below says the data arrives already in order; the only thing TanStack decides
// is which column is marked sorted and which way a click flips it. The sort
// itself happens in Postgres, because once this list is paginated the browser
// can only sort the page it was handed.
//
// The agreement this file used to hold by hand — headers, the empty row's
// colSpan and the skeleton's cell count all saying the same number — is now
// `ticketColumns.length` in all three places, so there is nothing left to drift.
// The tests still compare them against the *rendered* header count rather than
// against 5, which is what follows a column that is genuinely added.
//
// Still not merged with UsersTable into a shared DataTable. Adopting the same
// library for both is the convention; a shared component is a different claim,
// and the test it fails is the house rule: repetition is worth removing when
// the copies **must change together**, and a column added to the roster says
// nothing about this list.
export default function TicketsTable({
  tickets,
  isPending,
  sorting,
  onSortingChange,
}: {
  tickets: TicketRow[] | undefined;
  isPending: boolean;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
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
    state: { sorting },
    onSortingChange,
  });

  // Read off the table rather than off `ticketColumns`, so the skeleton and the
  // empty row count the same columns the header just rendered.
  const columns = table.getAllColumns();

  return (
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
            rows on screen while a re-sort is in flight, so clicking a header
            does not fall back to bars. */}
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
            — no sorted row model exists on this table at all. */}
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
  );
}

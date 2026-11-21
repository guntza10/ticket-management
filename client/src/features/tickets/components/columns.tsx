import {
  createColumnHelper,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import type { TicketStatus } from "../../../../../core/schemas/tickets.ts";
import type { TicketRow } from "../api/get-tickets";
import { categoryLabel, statusLabel } from "../labels";

/**
 * Which parts of TanStack Table this table switches on. v9 drops whatever is
 * not registered here out of the bundle, so the list is an opt-in rather than
 * documentation.
 *
 * `rowSortingFeature` brings the sorting state and the header APIs.
 * `sortedRowModel` is deliberately absent and `manualSorting` is set where the
 * table is built: Postgres does the sorting, and a client-side sorted row model
 * would quietly re-sort the page it was handed.
 *
 * `rowPaginationFeature` is the same arrangement one line down: it brings the
 * pagination state and the navigation APIs the footer reads, while
 * `paginatedRowModel` stays absent and `manualPagination` is set beside
 * `manualSorting`. The server already sliced the page; a paginated row model
 * here would slice the ten rows it was handed a second time.
 *
 * `columnMeta` types the extra field each column carries — v9 takes it per
 * table here rather than by declaration-merging a global interface, so one
 * table's meta cannot leak into another's.
 */
type TicketColumnMeta = {
  /**
   * How wide this column's placeholder bar is while the first page loads.
   *
   * It lives on the column rather than in the skeleton so the width sits beside
   * the thing it describes instead of in a second map keyed by column name.
   *
   * **It is not enforced.** `meta` is optional on a column def, so a column
   * added without one compiles clean — measured 2026-11-15: a sixth column with
   * no `meta` gave zero `tsc` errors. What saves it is the `?? "w-24"` fallback
   * in TicketsTable, and the cost of forgetting is one placeholder bar of the
   * wrong width, which is not worth a guard. The claim this comment used to
   * make — that a column "brings its own width" — was simply false.
   *
   * What *is* enforced is the **number** of bars: the skeleton loops
   * `table.getAllColumns()`, so it cannot disagree with the header.
   */
  skeletonWidth: string;
};

export const ticketTableFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnMeta: {} as TicketColumnMeta,
});

const columnHelper = createColumnHelper<typeof ticketTableFeatures, TicketRow>();

// Keyed by the union rather than built from the value, so a status added to
// core's TICKET_STATUSES fails to compile here until it is given a variant.
// Nothing asserts a variant — it is a class — which is exactly why it stays
// here while the two label maps moved to ../labels.ts on 2026-11-19: the words
// are read by the filter dropdowns too, the colour is this table's business
// alone.
const statusVariant: Record<
  TicketStatus,
  "default" | "secondary" | "outline"
> = {
  open: "default",
  resolved: "secondary",
  closed: "outline",
};

/**
 * One entry per column: what it is called, and how one ticket's value for it is
 * drawn. TicketsTable renders the header and the cells from this array and owns
 * no column knowledge of its own, which is what keeps the header count, the
 * skeleton's cell count and the empty row's `colSpan` from drifting apart —
 * they are all `ticketColumns.length` now.
 *
 * **Each column's id has to match a `TicketSortField` in
 * `core/schemas/tickets.ts`**, because `useTicketListQuery` sends the id of the
 * clicked column as `sortBy`. An id with no matching field does not throw: the
 * hook's `safeParse` refuses it and the click does nothing at all. What catches
 * that is a test rather than a type — *"asks the server for the column that was
 * clicked"* in TicketsTable.test.tsx, one case per column.
 *
 * `sortDescFirst` is the direction a first click picks. Newest-first is what a
 * date column is usually wanted for; a name or a subject reads forwards.
 */
export const ticketColumns = columnHelper.columns([
  columnHelper.accessor("subject", {
    meta: { skeletonWidth: "w-56" },
    header: "Subject",
    sortDescFirst: false,
    cell: ({ row }) => (
      <span className="font-medium">{row.original.subject}</span>
    ),
  }),
  // Two fields in one cell, and only the name is sortable — `senderEmail` is
  // not in TICKET_SORT_FIELDS, so this column sorts by what is printed on the
  // first line rather than by the address underneath it.
  columnHelper.accessor("senderName", {
    meta: { skeletonWidth: "w-40" },
    header: "Sender",
    sortDescFirst: false,
    cell: ({ row }) => (
      <>
        <span className="block">{row.original.senderName}</span>
        <span className="text-muted-foreground block text-sm">
          {row.original.senderEmail}
        </span>
      </>
    ),
  }),
  columnHelper.accessor("status", {
    meta: { skeletonWidth: "w-16" },
    header: "Status",
    sortDescFirst: false,
    cell: ({ row }) => (
      <Badge variant={statusVariant[row.original.status]}>
        {statusLabel[row.original.status]}
      </Badge>
    ),
  }),
  // An em dash, not an empty cell: nobody has classified this ticket yet, and a
  // blank reads as a column that failed to render. The server sorts these to
  // the bottom whichever direction is asked for.
  columnHelper.accessor("category", {
    meta: { skeletonWidth: "w-28" },
    header: "Category",
    sortDescFirst: false,
    cell: ({ row }) =>
      row.original.category === null ? (
        "—"
      ) : (
        <Badge variant="secondary">{categoryLabel[row.original.category]}</Badge>
      ),
  }),
  columnHelper.accessor("createdAt", {
    meta: { skeletonWidth: "w-20" },
    header: "Created",
    sortDescFirst: true,
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
  }),
]);

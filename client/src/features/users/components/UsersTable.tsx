import { useTable, type OnChangeFn, type PaginationState } from "@tanstack/react-table";
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
import { userColumns, userTableFeatures } from "./columns";
import type { UserRow } from "../api/get-users";

// The roster as a table: which of its three bodies to render, and the footer
// that moves between pages.
//
// Built on TanStack Table since 2026-11-16. That move was a **refactor with no
// behaviour change** — the roster had no sorting, no filtering and no
// pagination, and `userTableFeatures` registered nothing but the column meta to
// prove it. The reason was the project having one way of building a table
// rather than two, and the three tests below were the proof: not one assertion
// in them had to change.
//
// **Pagination arrived on 2026-11-21 and is the first thing to go through the
// instance here.** `rowPaginationFeature` is registered now; sorting still is
// not, so what ships on this page is still only what the page uses. The footer
// is rendered below rather than by `UsersPage` because `useTable` is called in
// this file — anything reading `getPageCount()` has to be inside it.
//
// `UsersTableRow` was deleted in the 2026-11-16 move. TanStack keeps each
// cell's renderer in the column definition, so a row component and a `columns`
// array are two answers to one question; its three cases moved into
// `UsersTable.test.tsx` rather than being dropped.
//
// What this file still owns is the agreement it was extracted for in the first
// place — the header count, the empty row's `colSpan` and the number of
// skeleton cells. All three now read `getAllColumns()`, so there is nothing left
// to keep in step by hand, and the tests still compare them against the
// *rendered* header count rather than against 5.
//
// `users` and `isPending` arrive as props rather than from `useUsers()` here:
// the page shows `error` above the Card, so it has to call the hook anyway, and
// calling it twice is two subscriptions to reason about for no gain. Props also
// make the three bodies below reachable from a test with no faked request.
export default function UsersTable({
  users,
  isPending,
  pagination,
  onPaginationChange,
  rowCount,
}: {
  users: UserRow[] | undefined;
  isPending: boolean;
  pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>;
  // The response's `total` — every user on the roster, not the ten on this
  // page — under the name the table option gives it. `undefined` while the
  // first page is in flight, which is what holds the footer back.
  rowCount: number | undefined;
}) {
  const table = useTable({
    features: userTableFeatures,
    columns: userColumns,
    data: users ?? [],
    // The server already sliced the page with `skip`/`take`, so the table must
    // not slice it again. Same pair as the ticket list, for the same reason;
    // `pageCount` is likewise left out so `setPageIndex` does no clamping.
    manualPagination: true,
    rowCount,
    state: { pagination },
    onPaginationChange,
  });

  // Read off the table rather than off `userColumns`, so the skeleton and the
  // empty row count the same columns the header just rendered.
  const columns = table.getAllColumns();

  return (
    <>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  <table.FlexRender header={header} />
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {/* Three placeholder rows — a guess at the roster size, which is fine,
              since the point is only to hold the shape. One cell per column, each
              as wide as that column's meta says. */}
          {isPending &&
            Array.from({ length: 3 }, (_, rowIndex) => (
              <TableRow key={rowIndex}>
                {columns.map((column) => (
                  <TableCell key={column.id}>
                    <Skeleton
                      className={column.columnDef.meta?.skeleton ?? "h-4 w-24"}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          {/* colSpan is the column count rather than a literal, and is still
              asserted against the rendered headers rather than trusted. */}
          {users?.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="text-muted-foreground"
              >
                No users found.
              </TableCell>
            </TableRow>
          )}
          {/* A deleted user keeps their row, shown muted rather than hidden —
              which is what explains, later, why their address still answers 409
              to a create. The muting is on the row, so it stays here rather than
              in a column definition. */}
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className={
                row.original.deletedAt !== null
                  ? "text-muted-foreground"
                  : undefined
              }
            >
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {/* Only once there is an answer to count — see TicketsTable, which is the
          same guard for the same reason.

          Worth knowing about this page in particular: creating a user
          invalidates every page of the roster, so the new row appears on
          whichever page the server puts it on, which on an ascending createdAt
          is the *last* one. The dialog does not jump there, and the footer is
          what makes that visible rather than confusing. */}
      {rowCount !== undefined && <TablePagination table={table} pagination={pagination} />}
    </>
  );
}

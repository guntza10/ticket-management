import { useTable } from "@tanstack/react-table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { userColumns, userTableFeatures } from "./columns";
import type { UserRow } from "../api/get-users";

// The roster as a table: which of its three bodies to render.
//
// Built on TanStack Table since 2026-11-16, and this file is a **refactor with
// no behaviour change**: the roster still has no sorting, no filtering and no
// pagination, and `userTableFeatures` registers no features beyond the column
// meta to prove it. The reason for the move is the project having one way of
// building a table rather than two — the ticket list went first because it is
// what needed sorting, and leaving this one hand-written would have meant a
// reader learning both shapes. The three tests below are the proof it is a
// refactor: not one assertion in them had to change.
//
// `UsersTableRow` was deleted in the same move. TanStack keeps each cell's
// renderer in the column definition, so a row component and a `columns` array
// are two answers to one question; its three cases moved into
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
}: {
  users: UserRow[] | undefined;
  isPending: boolean;
}) {
  const table = useTable({
    features: userTableFeatures,
    columns: userColumns,
    data: users ?? [],
  });

  // Read off the table rather than off `userColumns`, so the skeleton and the
  // empty row count the same columns the header just rendered.
  const columns = table.getAllColumns();

  return (
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
  );
}

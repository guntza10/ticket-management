import {
  createColumnHelper,
  rowPaginationFeature,
  tableFeatures,
} from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import DeleteUserDialog from "./DeleteUserDialog";
import EditUserDialog from "./EditUserDialog";
import type { UserRow } from "../api/get-users";

/**
 * Which parts of TanStack Table the roster switches on — and the list is short
 * on purpose.
 *
 * **No `rowSortingFeature`.** The roster is not sortable and is not meant to be:
 * it grows only when an admin adds somebody, and the only query parameter
 * `GET /api/users` takes is `?page=`. v9 drops whatever is not registered here
 * out of the bundle, so the sorting code the ticket list needs is simply not
 * shipped on this page. The day the roster wants sorting, it wants the server
 * half first.
 *
 * **`rowPaginationFeature` is registered, and it is the one thing the roster
 * and the ticket list genuinely share.** It arrived with `?page=` on
 * 2026-11-21 — not because the project wanted both tables to look alike, but
 * because paging is the same question on both and `TablePagination` reads it
 * off the table instance. `paginatedRowModel` is absent and `manualPagination`
 * is set where the table is built: the server sliced the page already.
 *
 * `columnMeta` is the per-table type for the extra field each column carries,
 * which v9 takes here rather than by declaration-merging a global interface —
 * so this shape and the ticket table's cannot leak into each other.
 */
type UserColumnMeta = {
  /**
   * The whole class for this column's placeholder bar, height included.
   *
   * The ticket table's equivalent holds only a width and lets the table write
   * `h-4`. That does not stretch to here: the actions column's placeholder
   * stands in for a pair of buttons, so it needs `h-8`. Carrying the full class
   * is the shape that survives a column whose content is not a line of text.
   *
   * Not enforced — `meta` is optional on a column def, so a column added
   * without one compiles clean and falls back in `UsersTable`. What *is*
   * enforced is the number of bars, which comes from `getAllColumns()`.
   */
  skeleton: string;
};

export const userTableFeatures = tableFeatures({
  rowPaginationFeature,
  columnMeta: {} as UserColumnMeta,
});

const columnHelper = createColumnHelper<typeof userTableFeatures, UserRow>();

/**
 * One entry per column: what it is called, and how one user's value for it is
 * drawn. `UsersTable` renders the header and the cells from this array and holds
 * no column knowledge of its own, which is what keeps the header count, the
 * skeleton's cell count and the empty row's `colSpan` from drifting apart.
 *
 * Deliberately **not** shared with the ticket list's `columns.tsx`. The two
 * tables are built the same way on purpose, but a column added to the roster
 * says nothing about the ticket list — the rule being applied is in the root
 * CLAUDE.md: repetition is worth removing only when the copies must change
 * together.
 */
export const userColumns = columnHelper.columns([
  // The `Deleted` badge sits beside the name rather than in a column of its
  // own: a column would mean a header cell, a sixth skeleton cell and a
  // `colSpan` bump, all to say something only some rows need to say. The cost
  // it does have: this cell's accessible name becomes "Some Name Deleted", so
  // specs find a row by its email cell.
  columnHelper.accessor("name", {
    meta: { skeleton: "h-4 w-28" },
    header: "Name",
    cell: ({ row }) => (
      <span className="flex items-center gap-2">
        {row.original.name}
        {row.original.deletedAt !== null && (
          <Badge variant="outline">Deleted</Badge>
        )}
      </span>
    ),
  }),
  columnHelper.accessor("email", {
    meta: { skeleton: "h-4 w-44" },
    header: "Email",
  }),
  columnHelper.accessor("role", {
    meta: { skeleton: "h-4 w-14" },
    header: "Role",
  }),
  columnHelper.accessor("createdAt", {
    meta: { skeleton: "h-4 w-20" },
    header: "Created",
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
  }),
  // A `display` column rather than an `accessor` one: it reads no single field
  // of the row, so there is nothing to accessor *by* — `id` has to be given by
  // hand instead of coming from a field name.
  //
  // No `header`. A heading over a column of icon buttons reads out before every
  // row and says nothing the buttons' own names do not.
  //
  // The whole row goes to each dialog though each reads only the fields it
  // needs; passing them one by one would have to be kept in step by hand.
  // Nothing is offered on a deleted row — the server refuses an edit with a 404
  // and there is no restore — and no delete on an admin, which is the UI half of
  // a rule the server enforces with `403 admin_not_deletable`. Hiding it is
  // courtesy; the refusal is what counts.
  columnHelper.display({
    id: "actions",
    meta: { skeleton: "h-8 w-20" },
    cell: ({ row }) =>
      row.original.deletedAt === null ? (
        <span className="flex justify-end gap-1">
          <EditUserDialog user={row.original} />
          {row.original.role !== "admin" && (
            <DeleteUserDialog user={row.original} />
          )}
        </span>
      ) : null,
  }),
]);

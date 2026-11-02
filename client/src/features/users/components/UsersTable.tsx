import UsersTableRow from "./UsersTableRow";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserRow } from "../api/get-users";

// The roster as a table: the columns it has, and which of its three bodies to
// render. It mirrors a collection, the way `UsersTableRow` mirrors one record —
// React's guidance names both (`RecipeList` beside `Recipe`), and a survey that
// only looked for the record-shaped half is what left this in the page until
// 2026-11-02.
//
// What it buys is not the shorter page: it is that **everything which has to
// agree on the column count now lives in one file** — the headers, the empty
// row's colSpan, and the number of skeleton cells. Those three sat in the page
// while the data cells sat in the row component, so adding a column meant
// editing two files and nothing said when one was forgotten.
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
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Created</TableHead>
          {/* The actions column has no label: a heading for a column of icon
              buttons reads out before every row and says nothing the buttons'
              own names do not. */}
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {/* Three placeholder rows — a guess at the roster size, which is fine,
            since the point is only to hold the shape. Each has one cell per
            header above, widths roughly matching the content that replaces it;
            `UsersTable.test.tsx` counts them against the headers, so a column
            added without a cell here fails rather than shifting the layout the
            day someone loads the page. */}
        {isPending &&
          Array.from({ length: 3 }, (_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-28" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-44" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-14" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-8 w-20" />
              </TableCell>
            </TableRow>
          ))}
        {/* colSpan has to match the header count above. It is asserted against
            the rendered headers rather than trusted, for the same reason. */}
        {users?.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-muted-foreground">
              No users found.
            </TableCell>
          </TableRow>
        )}
        {users?.map((user) => (
          <UsersTableRow key={user.id} user={user} />
        ))}
      </TableBody>
    </Table>
  );
}

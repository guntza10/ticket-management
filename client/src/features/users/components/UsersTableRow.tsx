import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import DeleteUserDialog from "./DeleteUserDialog";
import EditUserDialog from "./EditUserDialog";
import type { UserRow } from "../api/get-users";

// One row, one user — which is the criterion React's own guidance gives for
// splitting a UI up ("each component matches one piece of your data model"),
// and why this has a file of its own despite having a single caller. Reuse is
// the test for a wrapper, not for something shaped like the data.
//
// The practical payoff is in the tests: the three conditions below are reachable
// by rendering this with a prop, instead of through a page, a fake API, a query
// client and a router.
export default function UsersTableRow({ user }: { user: UserRow }) {
  // A deleted user keeps their row. Showing them muted rather than hiding them
  // is what explains, later, why their address still answers 409 to a create.
  const deleted = user.deletedAt !== null;

  return (
    <TableRow className={deleted ? "text-muted-foreground" : undefined}>
      <TableCell>
        {/* The badge sits beside the name rather than in a column of its own:
            a column would mean a header cell, a sixth skeleton cell and a
            colSpan bump, all to say something only some rows need to say.
            The cost it does have: this cell's accessible name becomes
            "Some Name Deleted", so specs find a row by its email cell. */}
        <span className="flex items-center gap-2">
          {user.name}
          {deleted && <Badge variant="outline">Deleted</Badge>}
        </span>
      </TableCell>
      <TableCell>{user.email}</TableCell>
      <TableCell>{user.role}</TableCell>
      <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
      {/* The whole row is handed to each dialog, though each reads only the
          fields it needs — passing them one by one would have to be kept in
          step by hand.
          Nothing is offered on a deleted row: the server refuses an edit with a
          404, and there is no restore. No delete on an admin either, which is
          the UI half of a rule the server enforces with a 403 — hiding it is
          courtesy, the refusal is what counts. */}
      <TableCell className="text-right">
        {!deleted && (
          <span className="inline-flex gap-1">
            <EditUserDialog user={user} />
            {user.role !== "admin" && <DeleteUserDialog user={user} />}
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

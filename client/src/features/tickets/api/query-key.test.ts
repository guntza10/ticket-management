import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { ticketKeys } from "./query-key";

// The same guard as `features/users/api/query-key.test.ts`, and here it is
// entirely forward-looking: nothing writes a ticket from the UI yet, so no
// mutation invalidates anything. That is exactly why it is worth having now —
// the first mutation to arrive will call `ticketKeys.all()` and trust that it
// reaches the list, and this is what makes that true rather than hoped.
//
// Both sorts in one test on purpose: the list key carries the sort, so a
// mutation has to reach **every** sorted entry, not whichever one happens to be
// on screen.
describe("ticketKeys", () => {
  it("puts every sorted list underneath the key a mutation would invalidate", async () => {
    const newestFirst = { sortBy: "createdAt", sortOrder: "desc" } as const;
    const bySubject = { sortBy: "subject", sortOrder: "asc" } as const;

    const queryClient = new QueryClient();
    queryClient.setQueryData(ticketKeys.list(newestFirst), []);
    queryClient.setQueryData(ticketKeys.list(bySubject), []);

    await queryClient.invalidateQueries({ queryKey: ticketKeys.all() });

    expect(
      queryClient.getQueryState(ticketKeys.list(newestFirst))?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(ticketKeys.list(bySubject))?.isInvalidated,
    ).toBe(true);
  });
});

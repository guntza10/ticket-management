import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { ticketKeys } from "./query-key";

// The same guard as `features/users/api/query-key.test.ts`, and here it is
// entirely forward-looking: nothing writes a ticket from the UI yet, so no
// mutation invalidates anything. That is exactly why it is worth having now —
// the first mutation to arrive will call `ticketKeys.all()` and trust that it
// reaches the list, and this is what makes that true rather than hoped.
//
// Three entries in one test on purpose: the list key carries the sort and the
// page, so a mutation has to reach **every** combination of them, not whichever
// one happens to be on screen. The second page matters as much as the second
// sort — a ticket edited from page 3 has to invalidate page 1 too, since the
// row may well have moved there.
describe("ticketKeys", () => {
  it("puts every sorted and paged list underneath the key a mutation would invalidate", async () => {
    const newestFirst = {
      sortBy: "createdAt",
      sortOrder: "desc",
      page: 1,
    } as const;
    const bySubject = { sortBy: "subject", sortOrder: "asc", page: 1 } as const;
    const thirdPage = { ...newestFirst, page: 3 } as const;

    const queryClient = new QueryClient();
    queryClient.setQueryData(ticketKeys.list(newestFirst), []);
    queryClient.setQueryData(ticketKeys.list(bySubject), []);
    queryClient.setQueryData(ticketKeys.list(thirdPage), []);

    await queryClient.invalidateQueries({ queryKey: ticketKeys.all() });

    expect(
      queryClient.getQueryState(ticketKeys.list(newestFirst))?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(ticketKeys.list(bySubject))?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(ticketKeys.list(thirdPage))?.isInvalidated,
    ).toBe(true);
  });
});

import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { userKeys } from "./query-key";

// What this file guards is the one thing the factory exists for and no other
// test can see: that a key a reader uses sits **underneath** the key a mutation
// invalidates.
//
// It became necessary on 2026-11-14. Until then `useUsers` read `["users"]` and
// every mutation invalidated `["users"]` — the same array, so they could not
// drift. Splitting them into `list()` and `all()` buys the ability to invalidate
// a whole feature at once, and costs a relationship that nothing checked:
// measured by making `list()` stop spreading `all()`, which left all 83
// component specs green while, in a browser, creating a user would have left
// the table showing the roster from before.
//
// Asserted through a real QueryClient rather than by comparing array prefixes by
// hand, because the rule under test is React Query's matching, not ours. A
// hand-rolled `startsWith` check would pass while the library disagreed.
describe("userKeys", () => {
  it("puts the roster underneath the key the mutations invalidate", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(userKeys.list(), []);

    await queryClient.invalidateQueries({ queryKey: userKeys.all() });

    expect(queryClient.getQueryState(userKeys.list())?.isInvalidated).toBe(true);
  });
});

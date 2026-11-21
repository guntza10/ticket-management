import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { UserListQuery } from "../../../../../core/schemas/users.ts";
import { userKeys } from "./query-key";

// Mirrors the `select` in GET /api/users. createdAt is a string, not a Date:
// JSON has no date type, so Prisma's DateTime arrives here as an ISO string —
// which is also why this type is not in core/ with the schemas. One type
// cannot describe the row on both sides of that conversion.
//
// It lived in pages/UsersPage.tsx until 2026-10-23. That was the wrong home
// twice over: it describes the users feature's data rather than one page's,
// and a feature may not import from pages/, so the edit form had to restate
// the three fields it needs instead of deriving them.
export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "agent" | "admin";
  createdAt: string;
  // Null means active. The roster returns deleted rows on purpose — they are
  // rendered muted and badged rather than hidden, so the admin can see why an
  // address is still taken. Same string-not-Date reason as createdAt.
  deletedAt: string | null;
};

/**
 * What GET /api/users answers: one page of the roster, and how many accounts
 * there are in total — including the soft-deleted ones, which this list shows
 * muted rather than hiding.
 *
 * `total` is what the footer needs; `users.length` is 10 on every page but the
 * last and so can never say how many pages there are.
 */
export type UserListResponse = {
  users: UserRow[];
  total: number;
};

// No status check and no try/catch: axios rejects on 4xx/5xx, and React Query
// turns that rejection into the `error` the page reads. The signal comes from
// React Query, which aborts it when the component unmounts or the query is
// replaced — the job a hand-rolled AbortController used to do.
async function getUsers(
  signal: AbortSignal,
  query: UserListQuery,
): Promise<UserListResponse> {
  const { data } = await api.get<UserListResponse>("/api/users", {
    signal,
    params: query,
  });
  return data;
}

/**
 * One page of the roster. The three mutations in this folder invalidate
 * `userKeys.all()`, which clears every page of it at once.
 *
 * `keepPreviousData` for the same reason the ticket list has it: the key
 * carries the page, so without it a click on Next has no data for the new key
 * and the table falls back to its skeleton — and the footer, which reads
 * `total` off this data, would disable its own buttons for the length of a
 * round trip.
 */
export function useUsers(query: UserListQuery) {
  return useQuery({
    queryKey: userKeys.list(query),
    queryFn: ({ signal }) => getUsers(signal, query),
    placeholderData: keepPreviousData,
  });
}

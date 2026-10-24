import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { USERS_QUERY_KEY } from "./query-key";

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
};

// No status check and no try/catch: axios rejects on 4xx/5xx, and React Query
// turns that rejection into the `error` the page reads. The signal comes from
// React Query, which aborts it when the component unmounts or the query is
// replaced — the job a hand-rolled AbortController used to do.
async function getUsers(signal: AbortSignal): Promise<UserRow[]> {
  const { data } = await api.get<{ users: UserRow[] }>("/api/users", { signal });
  return data.users;
}

/** The roster. The two mutations in this folder invalidate the same key. */
export function useUsers() {
  return useQuery({
    queryKey: USERS_QUERY_KEY,
    queryFn: ({ signal }) => getUsers(signal),
  });
}

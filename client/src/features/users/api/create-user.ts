import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { USERS_QUERY_KEY } from "./query-key";
import type { CreateUserInput } from "../../../../../core/schemas/users.ts";

// The write and the cache it has to refresh, named as one thing: at the call
// site this reads as `useCreateUser()` instead of a queryClient, a useMutation
// and a cache key threaded through the markup.
//
// The response body is ignored on purpose: the table reads from the roster
// query, so there is nothing to write into the cache by hand and no reason to
// couple the form to the row type.
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (user: CreateUserInput) => api.post("/api/users", user),
    // Returned, not fired and forgotten. mutateAsync then settles only once the
    // roster has actually refetched, so the dialog closes onto a table that
    // already holds the new row instead of racing it.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY }),
  });
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { USERS_QUERY_KEY } from "./query-key";

// Third sibling of useCreateUser and useUpdateUser. Like update it takes the id
// as a hook argument rather than a payload, because a delete has no body at all
// — the id in the URL is the whole request.
//
// The answer is ignored. The row the server sends back is the same one the
// roster is about to refetch, so reading it here would only create a second
// source for the same fact.
export function useDeleteUser(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.delete(`/api/users/${id}`),
    // Returned, so mutateAsync settles only once the roster has refetched —
    // the row is already muted and badged by the time the dialog closes.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY }),
  });
}

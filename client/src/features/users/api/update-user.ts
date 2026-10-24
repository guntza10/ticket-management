import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { USERS_QUERY_KEY } from "./query-key";
import type { UpdateUserInput } from "../../../../../core/schemas/users.ts";

// Sibling of useCreateUser, kept a separate hook rather than one `useSaveUser`
// that branches: the two take different payload types, because a create must
// carry a password and an edit must be able to leave it out. Merging them
// would mean one input type loose enough for both, which is exactly the
// guarantee the create path should not lose.
//
// It takes the id rather than reading it off the payload, because the id is
// not part of what gets written — updateUserSchema has no id, so the body
// cannot disagree with the URL.
export function useUpdateUser(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (user: UpdateUserInput) => api.patch(`/api/users/${id}`, user),
    // Returned for the same reason as the create: the dialog closes onto a
    // table that already shows the new name.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY }),
  });
}

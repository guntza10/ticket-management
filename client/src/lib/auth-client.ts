import { createAuthClient } from "better-auth/react";

// Points at the Express + Better Auth server. Setting baseURL makes the client
// send credentials (the session cookie) with every request, which is required
// because the SPA and the API live on different origins in dev.
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3000",
});

export const { signIn, signOut, useSession } = authClient;

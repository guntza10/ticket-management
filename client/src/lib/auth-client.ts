import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

// Points at the Express + Better Auth server. Setting baseURL makes the client
// send credentials (the session cookie) with every request, which is required
// because the SPA and the API live on different origins in dev.
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3000",
  // The server exposes `role` on the user via `additionalFields`, so it is
  // already present at runtime — but the client's types are built from the
  // client config alone. This plugin mirrors that field so `session.user.role`
  // is typed. Client and server are separate workspaces, so we declare the
  // shape here rather than importing the server's auth type.
  plugins: [
    inferAdditionalFields({
      user: { role: { type: ["agent", "admin"] } },
    }),
  ],
});

export const { signIn, signOut, useSession } = authClient;

import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { axiosErrorWithStatus } from "@/test/axios-error";

// The interceptor is the one piece of the signed-out story Better Auth cannot
// see: calls to our own API never pass through its client, so nothing there
// learns that the server refused one. These two tests are the whole contract —
// 401 leaves, everything else is handed back untouched.
//
// Driven through the instance's `adapter` rather than by reaching into
// `api.interceptors.handlers`: the adapter is the public seam, and going
// through it means the interceptor is exercised exactly as a real response
// would exercise it.
function answerWith(status: number) {
  api.defaults.adapter = () => Promise.reject(axiosErrorWithStatus(status));
}

function onPage(pathname: string) {
  const replace = vi.fn();
  vi.stubGlobal("location", { pathname, replace });
  return replace;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete api.defaults.adapter;
});

describe("the api instance", () => {
  it("sends the browser to the login page when the server says 401", async () => {
    const replace = onPage("/users");
    answerWith(401);

    // Still rejects: a caller that was waiting on this must not be handed a
    // resolved promise with no data, which is what swallowing the error here
    // would do to React Query.
    await expect(api.get("/api/users")).rejects.toThrow();

    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("leaves a 403 alone", async () => {
    const replace = onPage("/users");
    answerWith(403);

    await expect(api.get("/api/users")).rejects.toThrow();

    // An agent reaching an admin-only route gets this. It means "signed in,
    // not allowed" — sending them to a login page would answer a question
    // nobody asked, and would bounce straight back off ProtectedRoute, which
    // can see they are signed in.
    //
    // This spec is the only thing that catches it, which was measured rather
    // than assumed: widening the interceptor to `401 || 403` leaves all 89 E2E
    // specs green. The API-level ones use Playwright's `request` fixture, so
    // they never travel through this axios instance at all, and
    // `route-protection.spec.ts` — which an earlier version of this comment
    // claimed depended on the 403 — never produces one, because
    // `ProtectedRoute` sends an agent off /users before UsersPage mounts and
    // `useUsers` can fire.
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not reload the login page it is already on", async () => {
    const replace = onPage("/login");
    answerWith(401);

    await expect(api.get("/api/users")).rejects.toThrow();

    expect(replace).not.toHaveBeenCalled();
  });
});

import { test, expect } from "@playwright/test";
import { ADMIN, signIn, signInViaApi } from "./support/auth";
import { createUserViaApi } from "./support/users";

// The 401 interceptor in client/src/lib/api.ts, in a real browser.
//
// Its logic is already pinned by client/src/lib/api.test.ts (401 redirects, 403
// passes through, no loop on /login). What only a browser can answer is whether
// the thing is wired to anything: that a call this app actually makes, refused
// by the real server, moves the real address bar.
//
// Deliberately no reload and no goto between the dead session and the
// redirect. A reload goes through ProtectedRoute, which is a different
// mechanism and is already covered by delete-user.spec.ts ("throws the deleted
// user out of their own open session"). The point here is a click on the page
// that is already open.
//
// It has to be an ADMIN: every call through the axios instance goes to
// /api/users, which is admin-only, so an agent's own clicks never reach a 401
// at all — they reach a 403, which the interceptor is required to leave alone.
test.describe("Session expiry", () => {
  test("sends an admin whose session died to /login when a click hits the API", async ({
    page,
    request,
    context,
  }) => {
    // A row of its own to aim the delete at, for the reason delete-user.spec.ts
    // gives: five workers share one test database, and the seeded accounts have
    // to keep working everywhere else in the run. Nothing is actually deleted
    // here — the server refuses the call — so the row is only ever a target.
    //
    // The request context has its own cookie jar, which is what makes the
    // clearCookies below able to kill the browser's session without taking this
    // admin session with it.
    await signInViaApi(request, ADMIN);
    const created = await createUserViaApi(request, "session-expiry");

    await signIn(page, ADMIN);
    await page.goto("/users");
    await expect(
      page.getByRole("cell", { name: created.email, exact: true }),
    ).toBeVisible();

    // The session dies the way it realistically does — signed out in another
    // tab, or expired — rather than by deleting the user: an admin cannot be
    // soft-deleted, and this is the state that matters anyway. Better Auth's
    // client store still holds the session it fetched on page load, so nothing
    // on screen knows, which is exactly the gap the interceptor exists for.
    await context.clearCookies();

    // Still the same page, still mounted: if the app had redirected on its own
    // (a background refetch, say) this is the line that would fail, rather than
    // the assertion below passing for the wrong reason.
    await page
      .getByRole("button", { name: `Delete ${created.name}`, exact: true })
      .click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();

    // Armed before the click, so the wait cannot miss the answer it is waiting
    // for. It is not an assertion about internals but a way of naming *which*
    // refused call the redirect below came from — without it, a 401 on the
    // roster query would do just as well and the click would prove nothing.
    const refusal = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" && response.status() === 401,
    );

    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await refusal;

    // window.location.replace, so this is a real navigation and not a router
    // transition — the sign-in form has to come back from a cold page load.
    await expect(page).toHaveURL("/login");
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
    // And the login page stays put: the session really is gone, so nothing
    // bounces this back to "/".
    await expect(page.getByLabel("Email")).toBeVisible();
  });
});

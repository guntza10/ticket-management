import { test, expect, type Page } from "@playwright/test";
import { ADMIN, signIn, signInViaApi } from "./support/auth";
import {
  NEW_USER_PASSWORD,
  newUserEmail,
  readAllUserEmails,
} from "./support/users";

/**
 * Opens the dialog, fills it, submits, and hands back the dialog so the caller
 * can assert on what happened inside it.
 *
 * Two locator traps live here. The submit button is scoped to the dialog *and*
 * `exact`, because Playwright matches accessible names as a case-insensitive
 * substring and "Create" would otherwise also match the "Create user" trigger
 * behind it. And the password field is asked for by role, because
 * PasswordInput's show/hide toggle carries the same accessible name as the
 * input — the same reason support/auth.ts has passwordField().
 */
async function submitCreateUser(page: Page, user: { name: string; email: string }) {
  await page.getByRole("button", { name: "Create user" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Name").fill(user.name);
  await dialog.getByLabel("Email").fill(user.email);
  await dialog
    .getByRole("textbox", { name: "Password" })
    .fill(NEW_USER_PASSWORD);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();

  return dialog;
}

// Rows created here are never cleaned up by the spec — globalSetup's truncate
// owns that, once per run. Every address therefore comes from newUserEmail(),
// because five workers share one database. See support/users.ts.
test.describe("Create user", () => {
  // **This test asserted the new row on screen until 2026-11-21, and pagination
  // made that claim false rather than flaky.** The roster shows ten rows at a
  // time ordered oldest-first, so an account created now lands on the *last*
  // page: the invalidation refetches the page the admin is looking at, and the
  // new row is not in it. The test passed until then only because its own row
  // happened to be among the ten oldest, which depended on which worker got
  // there first.
  //
  // So the claim is written the way the app actually behaves: creating closes
  // the dialog, refetches the roster **without any navigation**, and really
  // writes the account. That the row renders correctly once it is in the
  // answer is `UsersTable.test.tsx`'s job, and the shape of the written row is
  // `users-api.spec.ts`'s.
  //
  // What is lost is worth stating: nothing in the browser now proves the admin
  // *sees* the account they just made — because they do not. That is recorded
  // as a gap in the root CLAUDE.md, with a search box as the fix.
  test("an admin creates an agent, and the roster refetches with no reload", async ({
    page,
    request,
  }) => {
    // Every GET the page makes to the roster endpoint, in order. A `request`
    // listener rather than a count of responses: what is being proven is that
    // the app *asked* again, which is what invalidating a query key does.
    const rosterRequests: string[] = [];
    page.on("request", (sent) => {
      if (sent.method() === "GET" && sent.url().includes("/api/users")) {
        rosterRequests.push(sent.url());
      }
    });

    await signIn(page, ADMIN);
    await page.goto("/users");
    // The first load has to have landed before the count below means anything.
    await expect(page.getByRole("table")).toBeVisible();
    const requestsBeforeCreate = rosterRequests.length;

    const email = newUserEmail("ui-create");
    const dialog = await submitCreateUser(page, { name: "New Hire", email });

    // The dialog closes only after the refetch settles — CreateUserForm returns
    // the invalidation from onSuccess — so this is the first half of the claim.
    await expect(dialog).toBeHidden();

    // And this is the half that cannot be inferred from the screen: a second
    // GET, with no reload and no navigation between the POST and it. Drop the
    // `invalidateQueries` call, or name a different key in it, and this is the
    // assertion that notices.
    await expect
      .poll(() => rosterRequests.length)
      .toBeGreaterThan(requestsBeforeCreate);

    // The account is really there, wherever the roster's order puts it. Read
    // over every page, because "the last page" is exactly where it is.
    await signInViaApi(request, ADMIN);
    expect(await readAllUserEmails(request)).toContain(email);
  });

  test("shows a taken address inline and keeps a single dialog open", async ({
    page,
  }) => {
    await signIn(page, ADMIN);
    await page.goto("/users");

    // Read-only: the seeded admin already owns this address, so this adds no
    // row for the other workers to trip over.
    const dialog = await submitCreateUser(page, {
      name: "Duplicate",
      email: ADMIN.email,
    });

    await expect(
      dialog.getByText("That email address is already in use."),
    ).toBeVisible();
    // Still exactly one dialog: routing the 409 to the shared ErrorDialog would
    // stack a second one over the form the person has to correct.
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(dialog).toBeVisible();
    // And what they typed is still there to fix, not wiped.
    await expect(dialog.getByLabel("Email")).toHaveValue(ADMIN.email);
  });

  test("the created agent can sign in and is not offered the Users link", async ({
    page,
  }) => {
    await signIn(page, ADMIN);
    await page.goto("/users");

    const email = newUserEmail("ui-signs-in");
    const dialog = await submitCreateUser(page, { name: "Fresh Hire", email });
    // The dialog closing is what says the create succeeded. The row is **not**
    // asserted on screen: the roster is paginated oldest-first, so a brand new
    // account is on the last page — and the sign-in below is a stronger proof
    // that the account exists than a cell would be anyway.
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL("/login");

    // The whole point of the feature: an account made through the UI is a real,
    // usable one — and it is an agent, not an admin, whatever the form sent.
    await signIn(page, { email, password: NEW_USER_PASSWORD });

    await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
  });
});

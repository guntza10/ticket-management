import { test, expect, type Page } from "@playwright/test";
import { ADMIN, signIn, signInViaApi } from "./support/auth";
import { createUserViaApi } from "./support/users";

/**
 * Finds a row by its **email** cell, which is the one field nothing in this
 * flow changes.
 *
 * Not by name: a deleted row puts the "Deleted" badge inside the name cell, so
 * that cell's accessible name becomes "Created x Deleted" and a locator written
 * against the name stops matching at exactly the moment the test wants to look
 * at it.
 */
function rowByEmail(page: Page, email: string) {
  return page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: email }) });
}

/**
 * Clicks a row's trash can and hands back the confirmation, without choosing
 * Cancel or Delete — each test does that itself.
 *
 * `exact` on the trigger because Playwright matches an accessible name as a
 * case-insensitive substring, and the actions cell beside the name also reads
 * "Edit <name> Delete <name>".
 */
async function openDeleteDialog(page: Page, rowName: string) {
  await page
    .getByRole("button", { name: `Delete ${rowName}`, exact: true })
    .click();

  // AlertDialog, not Dialog: Radix gives a destructive confirmation
  // role="alertdialog", and asking for that role is also what scopes the
  // confirm button away from the row trigger that shares its name prefix.
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();

  return dialog;
}

// Every test below deletes a row it created itself. Deleting a seeded account
// is not an option even in principle: the run is fullyParallel across five
// workers against one ticket_management_test database, and a deleted AGENT
// could no longer sign in anywhere else in the run.
//
// Scope is only that the pieces are wired to each other. The HTTP contract —
// who may delete, the allow-list, the wiped sessions, the refused re-sign-in —
// is pinned in users-api-delete.spec.ts, and the dialog's own branches (Cancel
// not calling the API, a refused delete's message, the badge and the missing
// buttons) in DeleteUserDialog.test.tsx and UsersPage.test.tsx.
test.describe("Delete user", () => {
  test.beforeEach(async ({ page, request }) => {
    // Two sessions for two clients: the request context needs one to create
    // rows over HTTP, the browser needs its own to reach /users at all.
    await signInViaApi(request, ADMIN);
    await signIn(page, ADMIN);
  });

  test("confirming the trash can turns the row Deleted without a reload", async ({
    page,
    request,
  }) => {
    const created = await createUserViaApi(request, "delete-row");

    await page.goto("/users");
    const row = rowByEmail(page, created.email);
    await expect(row).toBeVisible();

    const dialog = await openDeleteDialog(page, created.name);
    await expect(
      dialog.getByRole("heading", { name: `Delete ${created.name}?` }),
    ).toBeVisible();
    // exact, or this also matches the row's own "Delete <name>" trigger behind
    // the dialog — the confirm button's accessible name is just "Delete".
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(dialog).toBeHidden();

    // There is deliberately no page.reload() anywhere in this test. The badge
    // can only be on screen because the mutation invalidated the ["users"]
    // query — drop that invalidation and this is the test that notices.
    await expect(row.getByText("Deleted")).toBeVisible();
    // And nothing is offered on the row any more: an edit answers 404 and
    // there is no restore.
    await expect(
      row.getByRole("button", { name: `Edit ${created.name}`, exact: true }),
    ).toHaveCount(0);
    await expect(
      row.getByRole("button", { name: `Delete ${created.name}`, exact: true }),
    ).toHaveCount(0);
  });

  test("cancelling leaves the row exactly as it was", async ({
    page,
    request,
  }) => {
    const created = await createUserViaApi(request, "delete-cancel");

    await page.goto("/users");
    const row = rowByEmail(page, created.email);
    await expect(row).toBeVisible();

    const dialog = await openDeleteDialog(page, created.name);
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await expect(dialog).toBeHidden();

    await expect(row.getByText("Deleted")).toHaveCount(0);
    await expect(
      row.getByRole("button", { name: `Edit ${created.name}`, exact: true }),
    ).toBeVisible();
    await expect(
      row.getByRole("button", { name: `Delete ${created.name}`, exact: true }),
    ).toBeVisible();
  });

  test("throws the deleted user out of their own open session", async ({
    page,
    request,
    browser,
  }) => {
    const created = await createUserViaApi(request, "delete-session");

    // A second browser context, because the point is two people signed in at
    // once: one cookie jar per context, so the agent's session is really its
    // own and not the admin's.
    const agentContext = await browser.newContext();
    const agentPage = await agentContext.newPage();

    try {
      await signIn(agentPage, created);

      await page.goto("/users");
      const dialog = await openDeleteDialog(page, created.name);
      await dialog.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(
        rowByEmail(page, created.email).getByText("Deleted"),
      ).toBeVisible();

      // A reload, not a focus or visibilitychange event. Better Auth's client
      // refetches the session on those, but it rate-limits that refetch to once
      // every 5 seconds — so whether an event triggers a real request depends
      // on how long the lines above took, which is not something a test can
      // assert on. A reload asks the server unconditionally.
      await agentPage.reload();

      await expect(agentPage).toHaveURL("/login");
      await expect(
        agentPage.getByRole("button", { name: "Sign in", exact: true }),
      ).toBeVisible();
    } finally {
      await agentContext.close();
    }
  });
});

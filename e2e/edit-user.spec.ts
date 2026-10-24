import { test, expect, type Page } from "@playwright/test";
import { ADMIN, signIn, signInViaApi } from "./support/auth";
import { createUserViaApi } from "./support/users";

/**
 * Opens the edit dialog from a given row's pencil and hands the dialog back.
 *
 * `exact` is not optional here. Playwright matches an accessible name as a
 * case-insensitive substring, and the triggers are named "Edit <row name>" —
 * so once a test has renamed a row to "Created x Edited", the name
 * "Edit Created x" matches both buttons and the click is a strict-mode
 * violation instead of a click.
 */
async function openEditDialog(page: Page, rowName: string) {
  await page
    .getByRole("button", { name: `Edit ${rowName}`, exact: true })
    .click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  return dialog;
}

// Everything below edits rows this spec created. No test touches ADMIN or
// AGENT: the run is fullyParallel across five workers against one
// ticket_management_test database, so renaming a seeded account would pull the
// ground out from under every other worker. Created rows are never cleaned up
// either — globalSetup's truncate owns that, once per run — which is why every
// address comes from newUserEmail() inside createUserViaApi.
//
// What is left for this layer is only that the pieces are wired to each other:
// the HTTP contract is pinned in users-api-edit.spec.ts and the form's
// validation, request body and error branches in EditUserForm.test.tsx.
test.describe("Edit user", () => {
  test.beforeEach(async ({ page, request }) => {
    // Two sessions for two clients: the request context needs one to create
    // rows over HTTP, the browser needs its own to reach /users at all.
    await signInViaApi(request, ADMIN);
    await signIn(page, ADMIN);
  });

  test("opens a dialog prefilled with the row whose pencil was clicked", async ({
    page,
    request,
  }) => {
    // Two rows, and the second one is the one edited — with a single row on
    // screen a dialog that read the wrong row would still look right.
    const first = await createUserViaApi(request, "pick-first");
    const second = await createUserViaApi(request, "pick-second");

    await page.goto("/users");
    // Both triggers really are on the page, so picking between them is a choice
    // the component had to make.
    await expect(
      page.getByRole("button", { name: `Edit ${first.name}`, exact: true }),
    ).toBeVisible();

    const dialog = await openEditDialog(page, second.name);

    await expect(
      dialog.getByRole("heading", { name: "Edit user" }),
    ).toBeVisible();
    await expect(dialog.getByLabel("Name")).toHaveValue(second.name);
    await expect(dialog.getByLabel("Email")).toHaveValue(second.email);
    // Blank, because the database holds a hash and there is nothing to prefill
    // with — so the form needs to say what blank means.
    await expect(
      dialog.getByRole("textbox", { name: "New password" }),
    ).toHaveValue("");
    await expect(
      dialog.getByText("Leave blank to keep the current password."),
    ).toBeVisible();
  });

  test("a rename reaches the table without a reload and closes the dialog", async ({
    page,
    request,
  }) => {
    const created = await createUserViaApi(request, "rename");
    const editedName = `${created.name} Edited`;

    await page.goto("/users");
    const dialog = await openEditDialog(page, created.name);

    await dialog.getByLabel("Name").fill(editedName);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();

    await expect(dialog).toBeHidden();

    // There is deliberately no page.reload() here. The new name can only be on
    // screen because the mutation invalidated the ["users"] query — drop that
    // invalidation and this is the test that notices. The row is found by
    // address, the one field this edit left alone, because another worker's
    // rows are in the same table.
    const row = page.getByRole("row").filter({ hasText: created.email });
    // exact, or this cell locator also matches the actions cell beside it,
    // whose accessible name is "Edit Created rename Edited".
    await expect(
      row.getByRole("cell", { name: editedName, exact: true }),
    ).toBeVisible();
  });

  test("Save stays disabled until a field differs from the row", async ({
    page,
    request,
  }) => {
    const created = await createUserViaApi(request, "dirty");

    await page.goto("/users");
    const dialog = await openEditDialog(page, created.name);

    const save = dialog.getByRole("button", { name: "Save", exact: true });
    // Nothing has changed yet, and a save that writes the row back as it was
    // would still hash nothing, refetch the roster and look like it worked.
    await expect(save).toBeDisabled();

    await dialog.getByLabel("Name").fill(`${created.name} Draft`);
    await expect(save).toBeEnabled();

    // Typed back to what the row already says: this is "differs from the row",
    // not "has been typed in", which is what defaultValues buys.
    await dialog.getByLabel("Name").fill(created.name);
    await expect(save).toBeDisabled();
  });

  test("a taken address reports inline in the dialog that is still open", async ({
    page,
    request,
  }) => {
    const created = await createUserViaApi(request, "duplicate");

    await page.goto("/users");
    const dialog = await openEditDialog(page, created.name);

    // The seeded admin already owns this address, and this test only reads it —
    // no seeded row is modified.
    await dialog.getByLabel("Email").fill(ADMIN.email);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();

    await expect(
      dialog.getByText("That email address is already in use."),
    ).toBeVisible();
    // Still exactly one dialog: routing the 409 to the shared ErrorDialog would
    // stack a second one over the form the person has to correct.
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(dialog).toBeVisible();
    // And what they typed is still there to fix, not reset to the row.
    await expect(dialog.getByLabel("Email")).toHaveValue(ADMIN.email);
  });
});

import { test, expect, type Page } from "@playwright/test";
import { ADMIN, signIn } from "./support/auth";
import { NEW_USER_PASSWORD, newUserEmail } from "./support/users";

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
  test("an admin creates an agent and the row appears without a reload", async ({
    page,
  }) => {
    await signIn(page, ADMIN);
    await page.goto("/users");

    const email = newUserEmail("ui-create");
    const dialog = await submitCreateUser(page, { name: "New Hire", email });

    await expect(dialog).toBeHidden();

    // There is deliberately no page.reload() above. The row can only be on
    // screen because the mutation invalidated the ["users"] query — drop that
    // and this is the test that notices.
    const row = page.getByRole("row").filter({ hasText: email });
    await expect(
      row.getByRole("cell", { name: "New Hire", exact: true }),
    ).toBeVisible();
    // exact, so a name cell containing the word would not satisfy it.
    await expect(
      row.getByRole("cell", { name: "agent", exact: true }),
    ).toBeVisible();
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
    await submitCreateUser(page, { name: "Fresh Hire", email });
    await expect(page.getByRole("cell", { name: email })).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL("/login");

    // The whole point of the feature: an account made through the UI is a real,
    // usable one — and it is an agent, not an admin, whatever the form sent.
    await signIn(page, { email, password: NEW_USER_PASSWORD });

    await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
  });
});

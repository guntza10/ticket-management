import { test, expect } from "@playwright/test";
import { ADMIN, API_URL, signIn } from "./support/auth";

test.describe("Session lifecycle", () => {
  test("keeps the user signed in across a full page reload", async ({
    page,
  }) => {
    await signIn(page, ADMIN);

    await page.reload();

    await expect(page).toHaveURL("/");
    await expect(page.getByText("You are signed in.")).toBeVisible();
    await expect(page.getByText(ADMIN.name, { exact: true })).toBeVisible();
  });

  test("logging out ends the session, not just the UI", async ({ page }) => {
    await signIn(page, ADMIN);

    await page.getByRole("button", { name: "Log out" }).click();

    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

    // The cookie is gone as far as the API is concerned...
    const me = await page.request.get(`${API_URL}/api/me`);
    expect(me.status()).toBe(401);

    // ...so the protected route bounces the user again.
    await page.goto("/");
    await expect(page).toHaveURL("/login");
  });

  test("does not expose the home page to the Back button after logging out", async ({
    page,
  }) => {
    await signIn(page, ADMIN);

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL("/login");

    await page.goBack();

    await expect(page).toHaveURL("/login");
    await expect(page.getByText("You are signed in.")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Log out" })).toHaveCount(0);
  });
});

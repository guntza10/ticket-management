import { test, expect, type Page } from "@playwright/test";
import { ADMIN, AGENT, signIn } from "./support/auth";

const HOME_PAGE_BODY = "You are signed in.";

// Assert on a row the table actually renders, not on page chrome. These specs
// used to look for a placeholder sentence; the commit that replaced it with the
// real table never updated them, so two went red and the third ("not visible")
// passed for the wrong reason — the text was simply gone. Data is what makes
// this page correct, so data is what the assertions read.
function userRow(page: Page, email: string) {
  return page.getByRole("cell", { name: email });
}

test.describe("Route protection — signed out", () => {
  test("redirects a signed-out visitor from / to /login", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("redirects a signed-out visitor from /users to /login", async ({
    page,
  }) => {
    await page.goto("/users");

    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });
});

test.describe("Route protection — signed in", () => {
  test("lets an admin open /users", async ({ page }) => {
    await signIn(page, ADMIN);

    await page.goto("/users");

    await expect(page).toHaveURL("/users");
    // Both seeded accounts, so this also proves the request carried the session
    // cookie: without it the API answers 401 and no row is rendered at all.
    await expect(userRow(page, ADMIN.email)).toBeVisible();
    await expect(userRow(page, AGENT.email)).toBeVisible();
  });

  test("sends an agent who opens /users home, not to /login", async ({
    page,
  }) => {
    await signIn(page, AGENT);

    await page.goto("/users");

    await expect(page).toHaveURL("/");
    await expect(page.getByText(HOME_PAGE_BODY)).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });

  test("redirects a signed-in user away from /login", async ({ page }) => {
    await signIn(page, ADMIN);

    await page.goto("/login");

    await expect(page).toHaveURL("/");
    await expect(page.getByText(HOME_PAGE_BODY)).toBeVisible();
  });
});

test.describe("Role-driven navigation", () => {
  test("shows the Users link to an admin", async ({ page }) => {
    await signIn(page, ADMIN);

    const usersLink = page.getByRole("link", { name: "Users" });
    await expect(usersLink).toBeVisible();

    await usersLink.click();
    await expect(page).toHaveURL("/users");
    await expect(userRow(page, ADMIN.email)).toBeVisible();
  });

  test("hides the Users link from an agent", async ({ page }) => {
    await signIn(page, AGENT);

    await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  });
});

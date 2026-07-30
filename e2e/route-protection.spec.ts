import { test, expect } from "@playwright/test";
import { ADMIN, AGENT, signIn } from "./support/auth";

const USERS_PAGE_BODY = "Admin-only. User management lands here.";
const HOME_PAGE_BODY = "You are signed in.";

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
    await expect(page.getByText(USERS_PAGE_BODY)).toBeVisible();
  });

  test("sends an agent who opens /users home, not to /login", async ({
    page,
  }) => {
    await signIn(page, AGENT);

    await page.goto("/users");

    await expect(page).toHaveURL("/");
    await expect(page.getByText(HOME_PAGE_BODY)).toBeVisible();
    await expect(page.getByText(USERS_PAGE_BODY)).not.toBeVisible();
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
    await expect(page.getByText(USERS_PAGE_BODY)).toBeVisible();
  });

  test("hides the Users link from an agent", async ({ page }) => {
    await signIn(page, AGENT);

    await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  });
});

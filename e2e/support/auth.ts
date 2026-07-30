import { expect, type Page } from "@playwright/test";

// The E2E API. Specs that talk HTTP directly (auth-api.spec.ts) need the
// absolute URL, because `baseURL` in the config points at the SPA on 5174.
export const API_URL = "http://localhost:3001";

// Seeded by `npm run db:seed:test --workspace server` (server/.env.test).
export const ADMIN = {
  email: "admin@test.local",
  password: "password1234",
  name: "Admin",
};

export const AGENT = {
  email: "agent@test.local",
  password: "password1234",
  name: "Agent",
};

type Credentials = { email: string; password: string };

export function emailField(page: Page) {
  return page.getByLabel("Email");
}

// getByLabel("Password") matches two elements — the input and PasswordInput's
// "Show password" toggle, which carries the same accessible name. Asking for
// the textbox role picks the field.
export function passwordField(page: Page) {
  return page.getByRole("textbox", { name: "Password" });
}

export function submitButton(page: Page) {
  return page.getByRole("button", { name: "Sign in", exact: true });
}

/** Fills the login form and submits it, without asserting the outcome. */
export async function submitLogin(page: Page, credentials: Credentials) {
  await emailField(page).fill(credentials.email);
  await passwordField(page).fill(credentials.password);
  await submitButton(page).click();
}

/** Signs in from a cold start and waits until the home page is really shown. */
export async function signIn(page: Page, credentials: Credentials) {
  await page.goto("/login");
  await submitLogin(page, credentials);
  await expect(page).toHaveURL("/");
  await expect(page.getByText("You are signed in.")).toBeVisible();
}

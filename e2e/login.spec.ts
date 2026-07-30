import { test, expect, type Page } from "@playwright/test";
import {
  ADMIN,
  AGENT,
  emailField,
  passwordField,
  submitButton,
  submitLogin,
} from "./support/auth";

// Records every request the page makes to the sign-in endpoint, so the
// validation tests can prove the form never reached the API.
function recordSignInRequests(page: Page) {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/auth/sign-in")) calls.push(request.url());
  });
  return calls;
}

async function openLogin({ page }: { page: Page }) {
  await page.goto("/login");
}

/** Submits credentials the server will reject, and returns the open dialog. */
async function openErrorDialog(page: Page) {
  await submitLogin(page, { email: ADMIN.email, password: "wrong-password" });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("Sign in — valid credentials", () => {
  test.beforeEach(openLogin);

  test("signs an admin in and shows their name on the home page", async ({
    page,
  }) => {
    await submitLogin(page, ADMIN);

    await expect(page).toHaveURL("/");
    await expect(page.getByText("You are signed in.")).toBeVisible();
    await expect(page.getByText(ADMIN.name, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  });

  test("signs an agent in and shows their name on the home page", async ({
    page,
  }) => {
    await submitLogin(page, AGENT);

    await expect(page).toHaveURL("/");
    await expect(page.getByText("You are signed in.")).toBeVisible();
    await expect(page.getByText(AGENT.name, { exact: true })).toBeVisible();
  });

  test("submits with the Enter key from the password field", async ({
    page,
  }) => {
    await emailField(page).fill(ADMIN.email);
    await passwordField(page).fill(ADMIN.password);

    await passwordField(page).press("Enter");

    await expect(page).toHaveURL("/");
    await expect(page.getByText("You are signed in.")).toBeVisible();
  });

  test("sends only one sign-in request when Sign in is double-clicked", async ({
    page,
  }) => {
    const signInCalls = recordSignInRequests(page);

    await emailField(page).fill(ADMIN.email);
    await passwordField(page).fill(ADMIN.password);
    await submitButton(page).dblclick();

    await expect(page).toHaveURL("/");
    await expect(page.getByText("You are signed in.")).toBeVisible();
    expect(signInCalls).toHaveLength(1);
  });
});

// Pinning current behavior — these were unknown before the tests existed.
test.describe("Sign in — email spelling", () => {
  test.beforeEach(openLogin);

  test("accepts the email in a different case", async ({ page }) => {
    await submitLogin(page, {
      email: ADMIN.email.toUpperCase(),
      password: ADMIN.password,
    });

    await expect(page).toHaveURL("/");
    await expect(page.getByText(ADMIN.name, { exact: true })).toBeVisible();
  });

  test("signs in with a space-padded email, because the field trims it", async ({
    page,
  }) => {
    await emailField(page).fill(` ${ADMIN.email} `);

    // The field is input[type=email], so the browser's value-sanitization
    // algorithm strips the padding before zod or the API ever sees it. Posting
    // the padded address straight to the API is refused instead — see
    // auth-api.spec.ts, "refuses a space-padded email as malformed".
    await expect(emailField(page)).toHaveValue(ADMIN.email);

    await passwordField(page).fill(ADMIN.password);
    await submitButton(page).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByText("You are signed in.")).toBeVisible();
  });
});

test.describe("Sign in — form validation", () => {
  test.beforeEach(openLogin);

  test("rejects a malformed email inline and never calls the API", async ({
    page,
  }) => {
    const signInCalls = recordSignInRequests(page);

    await submitLogin(page, { email: "not-an-email", password: "password1234" });

    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page).toHaveURL("/login");
    expect(signInCalls).toHaveLength(0);
  });

  test("requires a password and never calls the API", async ({ page }) => {
    const signInCalls = recordSignInRequests(page);

    await emailField(page).fill(ADMIN.email);
    await submitButton(page).click();

    await expect(page.getByText("Password is required.")).toBeVisible();
    await expect(page).toHaveURL("/login");
    expect(signInCalls).toHaveLength(0);
  });

  test("requires an email and never calls the API", async ({ page }) => {
    const signInCalls = recordSignInRequests(page);

    await passwordField(page).fill(ADMIN.password);
    await submitButton(page).click();

    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page).toHaveURL("/login");
    expect(signInCalls).toHaveLength(0);
  });

  test("shows the inline error when Enter is pressed with a bad email", async ({
    page,
  }) => {
    const signInCalls = recordSignInRequests(page);

    await emailField(page).fill("not-an-email");
    await passwordField(page).fill(ADMIN.password);
    await passwordField(page).press("Enter");

    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page).toHaveURL("/login");
    expect(signInCalls).toHaveLength(0);
  });

  test("clears a field error once the input is corrected and resubmitted", async ({
    page,
  }) => {
    await submitButton(page).click();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.getByText("Password is required.")).toBeVisible();

    // Fix only the email: its error must go, the password's must remain.
    await emailField(page).fill(ADMIN.email);
    await submitButton(page).click();

    await expect(
      page.getByText("Enter a valid email address."),
    ).not.toBeVisible();
    await expect(page.getByText("Password is required.")).toBeVisible();
  });
});

test.describe("Sign in — rejected credentials", () => {
  test.beforeEach(openLogin);

  test("shows the error dialog for a wrong password and stays on /login", async ({
    page,
  }) => {
    await submitLogin(page, { email: ADMIN.email, password: "wrong-password" });

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Sign in failed" }),
    ).toBeVisible();
    // The rejection is not reported as an inline field error.
    await expect(page.getByText("Password is required.")).not.toBeVisible();
    await expect(page).toHaveURL("/login");
  });

  test("shows the error dialog for an email that does not exist", async ({
    page,
  }) => {
    await submitLogin(page, {
      email: "nobody-here@test.local",
      password: "password1234",
    });

    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "Sign in failed" }),
    ).toBeVisible();
    await expect(page).toHaveURL("/login");
  });

  test("lets the user dismiss the error dialog and then sign in", async ({
    page,
  }) => {
    const dialog = await openErrorDialog(page);
    await dialog.getByRole("button", { name: "OK" }).click();
    await expect(dialog).not.toBeVisible();

    await passwordField(page).fill(ADMIN.password);
    await submitButton(page).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByText("You are signed in.")).toBeVisible();
  });
});

// ErrorDialog's comment claims four close paths; each one gets a test.
test.describe("Error dialog — ways to close it", () => {
  test.beforeEach(openLogin);

  test("closes on the OK button", async ({ page }) => {
    const dialog = await openErrorDialog(page);

    await dialog.getByRole("button", { name: "OK" }).click();

    await expect(dialog).not.toBeVisible();
  });

  test("closes on Escape", async ({ page }) => {
    const dialog = await openErrorDialog(page);

    await page.keyboard.press("Escape");

    await expect(dialog).not.toBeVisible();
  });

  test("closes on a click outside it", async ({ page }) => {
    const dialog = await openErrorDialog(page);

    // The backdrop covers the viewport, so the top-left corner is outside the
    // dialog itself — clicking by coordinate keeps this free of CSS selectors.
    await page.mouse.click(5, 5);

    await expect(dialog).not.toBeVisible();
  });

  test("closes on the built-in X button", async ({ page }) => {
    const dialog = await openErrorDialog(page);

    await dialog.getByRole("button", { name: "Close" }).click();

    await expect(dialog).not.toBeVisible();
  });
});

test.describe("Password field", () => {
  test.beforeEach(openLogin);

  test("toggles the password between hidden and visible", async ({ page }) => {
    const password = passwordField(page);
    await password.fill(ADMIN.password);
    await expect(password).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue(ADMIN.password);

    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");
  });
});

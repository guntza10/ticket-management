import { test, expect, type Page } from "@playwright/test";
import { ADMIN, AGENT, signIn } from "./support/auth";
import {
  newInboundEmail,
  sendEmailExpectingNewTicket,
} from "./support/inbound-email";

/**
 * The row the seeded ticket renders into, found by its subject — which
 * `newSubject()` makes unique per spec.
 *
 * It has to be found that way and not by position: the run is fullyParallel
 * across five workers against one `ticket_management_test` database that is
 * truncated once per run, so the other ticket specs' rows are on this page too.
 * Nothing here asserts how many rows exist or which one is first, for the same
 * reason.
 */
function subjectCell(page: Page, subject: string) {
  return page
    .getByRole("row")
    .filter({ hasText: subject })
    .getByRole("cell", { name: subject, exact: true });
}

// Every ticket these tests read is created over HTTP first, through the same
// webhook a mail provider would call, because that endpoint is a ticket's only
// writer — there is no POST /api/tickets and no UI that creates one. Seeding it
// before signing in also means the list has something in it on its first load,
// with no refetch to wait for.
test.describe("Ticket list", () => {
  test("an agent reaches the list from the nav bar and sees a ticket that arrived by email", async ({
    page,
    request,
  }) => {
    const email = newInboundEmail("ui-list");
    await sendEmailExpectingNewTicket(request, email);

    await signIn(page, AGENT);

    // The link is outside NavBar's `role === "admin"` check on purpose: every
    // signed-in role works tickets. Moving it inside is invisible to tsc and to
    // oxlint, so this click is what notices.
    await page.getByRole("link", { name: "Tickets" }).click();

    // And the route carries no `role` prop, unlike /users. Note which line
    // below actually proves that: adding role="admin" to /tickets was measured
    // against this spec and this assertion still **passed**, because the URL is
    // /tickets for the moment ProtectedRoute spends waiting on the session and
    // toHaveURL retries until it matches. The row assertion is what went red.
    await expect(page).toHaveURL("/tickets");

    const row = page.getByRole("row").filter({ hasText: email.subject });
    await expect(subjectCell(page, email.subject)).toBeVisible();
    // Not exact: the sender cell holds the name above the address, so its
    // accessible name reads "Sender ui-list sender-ui-list-<uuid>@test.local".
    await expect(row.getByRole("cell", { name: email.from })).toBeVisible();
    // "Open", not "open". The column is a Postgres enum and the sentence a
    // person reads is TicketsTableRow's job (statusLabel); rendering the raw
    // value would fail here.
    await expect(
      row.getByRole("cell", { name: "Open", exact: true }),
    ).toBeVisible();
    // Deliberately nothing about the Created cell: it renders through
    // toLocaleDateString(), so its text depends on the machine's locale and
    // timezone rather than on the app.
  });

  test("keeps a ticket's body off the list page", async ({ page, request }) => {
    const email = newInboundEmail("ui-body");
    await sendEmailExpectingNewTicket(request, email);

    await signIn(page, AGENT);
    await page.goto("/tickets");

    // Assert the row arrived *first*. Without it, "the body is nowhere" would
    // also hold on a blank page, which is the one way this test could pass
    // while proving nothing.
    await expect(subjectCell(page, email.subject)).toBeVisible();

    // GET /api/tickets leaves `body` and `bodyHtml` out of its select, and this
    // is where that stops being a key-set detail: `bodyHtml` is stored exactly
    // as it arrived, unsanitised, so the fewer places it travels to the better.
    await expect(page.getByText(email.body)).toHaveCount(0);
  });

  test("lets an admin open the list too", async ({ page, request }) => {
    const email = newInboundEmail("ui-admin");
    await sendEmailExpectingNewTicket(request, email);

    await signIn(page, ADMIN);

    // An admin can do everything an agent can, so they get the same link and
    // the same page — this is the first route in the app guarded by requireAuth
    // alone, with no role check on either side.
    await page.getByRole("link", { name: "Tickets" }).click();

    await expect(page).toHaveURL("/tickets");
    await expect(subjectCell(page, email.subject)).toBeVisible();
  });
});

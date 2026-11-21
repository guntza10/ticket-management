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

/**
 * Narrows the list to the one ticket this spec created, by typing its subject
 * into the search box.
 *
 * **Pagination is what made this necessary (2026-11-21).** `GET /api/tickets`
 * answers ten rows at a time, newest first, so a posted ticket is on page one
 * only while fewer than ten newer ones exist — and a run creates about ninety
 * across five workers. Measured: `Ticket ui-admin` ended a full run at position
 * 29, on page three, so `toBeVisible()` on an unfiltered list had stopped being
 * a statement about the app and become a statement about who posted last.
 *
 * The subject is unique per spec (`newSubject`), so searching for it leaves one
 * row — which is the same trick `tickets-filter.spec.ts` and
 * `tickets-pagination.spec.ts` use, and the only one available on a list whose
 * order five workers are changing.
 */
async function searchForSubject(page: Page, subject: string) {
  await page
    .getByRole("textbox", { name: "Search tickets" })
    .fill(subject);
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

    // Narrowed to this spec's own ticket *after* the click, so the click is
    // still what proves the nav link works. See searchForSubject above for why
    // the unfiltered list can no longer be asserted on.
    await searchForSubject(page, email.subject);

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
    // person reads is columns.tsx's job (statusLabel); rendering the raw
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
    // Straight to a filtered URL rather than typing, because this test is not
    // about the toolbar: `?search=` is a parameter the page reads on load, so
    // one navigation puts the row on screen with no debounce to wait out.
    await page.goto(`/tickets?search=${encodeURIComponent(email.subject)}`);

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

    await searchForSubject(page, email.subject);
    await expect(subjectCell(page, email.subject)).toBeVisible();
  });
});

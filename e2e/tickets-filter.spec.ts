import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { AGENT, signIn } from "./support/auth";
import {
  newInboundEmail,
  sendEmailExpectingNewTicket,
} from "./support/inbound-email";

/**
 * The toolbar on `/tickets` in a real browser: the search box, the two
 * dropdowns, and the three places the filters have to survive — a refresh, the
 * back button, and a click on a column header.
 *
 * **Every row here is found by a token no other worker could produce.** Five
 * workers share one `ticket_management_test` database that `globalSetup`
 * truncates once per *run*, so every ticket any spec posts is on this page too
 * — `support/inbound-email.ts` spells that out at `newSubject`. A filter is a
 * property of the whole table, so the only claims these specs make are "the row
 * I created is on screen" and "it is not", never a count, a length or a
 * position in the full list.
 *
 * A UUID is also what gives the negative assertions teeth: a search for a fresh
 * token can legitimately be expected to show *nothing*, which a page that never
 * sent `?search=` fails immediately.
 *
 * What is deliberately absent: any positive case for a category, or for
 * `resolved`/`closed`. The webhook writes `status: open` with no category and
 * nothing in the app can change either yet, so a test asserting "the row is
 * there when its category matches" would have no row to assert about and would
 * pass against a page that ignored the dropdown entirely. The provable half is
 * the one below — a filter the ticket does not satisfy takes the row away.
 */
function filterToken() {
  return crypto.randomUUID();
}

/** A ticket whose subject is exactly what the caller asks for. */
function createTicket(
  request: APIRequestContext,
  label: string,
  subject: string,
) {
  return sendEmailExpectingNewTicket(request, {
    ...newInboundEmail(label),
    subject,
  });
}

/** The row a ticket renders into, found by its subject rather than by position. */
function ticketRow(page: Page, subject: string) {
  return page.getByRole("row").filter({ hasText: subject });
}

function searchBox(page: Page) {
  // The textbox role rather than getByLabel: `aria-label="Search tickets"` is
  // the name the toolbar gives it, and asking for the role keeps this locator
  // off the placeholder, which disappears the moment anything is typed.
  return page.getByRole("textbox", { name: "Search tickets" });
}

/**
 * Types a term into the search box and waits for it to reach the URL.
 *
 * **The wait is not politeness, it is what keeps these tests off a race.** The
 * box is debounced 300ms, and a dropdown touched inside that window navigates
 * from a query that does not hold the term yet — so the keystroke's own commit
 * lands afterwards, and which of the two writes last decides what the URL says.
 * Measured while writing this file: without this line, three tests passed only
 * because the debounce happened to fire last, and one of them went on passing
 * against a toolbar whose "All statuses" option was deliberately broken.
 *
 * The expected URL is exact rather than a regex because every test here types
 * first, with the URL still a bare `/tickets`: an unsorted, unfiltered list
 * writes no parameters at all, so `?search=` is the whole query string.
 */
async function searchFor(page: Page, term: string) {
  await searchBox(page).fill(term);
  await expect(page).toHaveURL(`/tickets?search=${term}`);
}

/**
 * Picks a value out of one of the two Radix dropdowns.
 *
 * The trigger is a `combobox` named by a visually-hidden `<label htmlFor>`, and
 * the menu items are `option`s in a portal — so the option is located by role
 * too rather than by text, which would also match a `Status` cell reading
 * "Open" in the table underneath.
 */
async function chooseFilter(page: Page, dropdown: string, option: string) {
  await page.getByRole("combobox", { name: dropdown }).click();
  await page.getByRole("option", { name: option }).click();
}

// Signing in is the only setup every test here shares. The rows are not: each
// test posts its own, because a ticket created in a `beforeEach` would be a row
// the next test found lying around rather than one it put there.
test.describe("Ticket list — filtering", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, AGENT);
  });

  test("narrows the table to the ticket whose subject is typed into the search box", async ({
    page,
    request,
  }) => {
    const token = filterToken();
    const match = await createTicket(
      request,
      "search-match",
      `Printer jam ${token}`,
    );
    const other = await createTicket(
      request,
      "search-other",
      `Laptop battery ${filterToken()}`,
    );

    await page.goto("/tickets");

    // Both rows first. Without this the narrowing below would also "pass" on a
    // page that never rendered either of them, which is the one way this test
    // could prove nothing.
    await expect(ticketRow(page, match.subject)).toBeVisible();
    await expect(ticketRow(page, other.subject)).toBeVisible();

    // Nothing is asserted straight after `fill()`: `searchFor` waits on the URL
    // instead, which is what the 300ms debounce requires and also pins the whole
    // query string rather than one parameter.
    await searchFor(page, token);

    await expect(ticketRow(page, match.subject)).toBeVisible();
    await expect(ticketRow(page, other.subject)).toBeHidden();
  });

  test("narrows by status on top of the search, and takes the row away when the status does not match", async ({
    page,
    request,
  }) => {
    const token = filterToken();
    const ticket = await createTicket(
      request,
      "status-filter",
      `Combined ${token}`,
    );
    const row = ticketRow(page, ticket.subject);

    await page.goto("/tickets");
    await searchFor(page, token);
    await expect(row).toBeVisible();

    // `open` is what the webhook writes, so this is the only status with a row
    // behind it. On its own it is the weak half — it would hold on a page that
    // dropped the parameter, because every ticket in the database is open.
    await chooseFilter(page, "Filter by status", "Open");
    await expect(page).toHaveURL(`/tickets?search=${token}&status=open`);
    await expect(row).toBeVisible();

    // This is the half with teeth: the two filters have to narrow together, so
    // asking for a status the ticket does not have must empty the table even
    // though the search still matches it.
    await chooseFilter(page, "Filter by status", "Resolved");
    await expect(page).toHaveURL(`/tickets?search=${token}&status=resolved`);
    await expect(row).toBeHidden();

    // And the table says so instead of going blank. `TicketsTable` documents
    // this body as the one state E2E cannot stage — five workers share the
    // database, so some row always exists — and **filtering is what made it
    // reachable**: a token nothing else carries plus a status no ticket has is
    // an answer that is genuinely empty. Nothing is asserted about how many
    // rows are on screen; the claim is only that this cell is.
    await expect(
      page.getByRole("cell", { name: "No tickets found.", exact: true }),
    ).toBeVisible();
  });

  test("brings the row back when the status filter is cleared", async ({
    page,
    request,
  }) => {
    const token = filterToken();
    const ticket = await createTicket(
      request,
      "status-clear",
      `Clearable ${token}`,
    );
    const row = ticketRow(page, ticket.subject);

    await page.goto("/tickets");
    await searchFor(page, token);
    await chooseFilter(page, "Filter by status", "Resolved");
    await expect(row).toBeHidden();

    // "All statuses" is the first item in the menu, and its value is a word
    // that is deliberately not a member of the enum — so clearing has to leave
    // `?status=` out of the URL rather than send that word to the API, which
    // would answer 400 invalid_query and show an error instead of the list.
    await chooseFilter(page, "Filter by status", "All statuses");
    await expect(page).toHaveURL(`/tickets?search=${token}`);
    await expect(row).toBeVisible();
  });

  test("takes away a ticket nothing has classified when a category is chosen", async ({
    page,
    request,
  }) => {
    const token = filterToken();
    const ticket = await createTicket(
      request,
      "category-filter",
      `Unclassified ${token}`,
    );
    const row = ticketRow(page, ticket.subject);

    await page.goto("/tickets");
    await searchFor(page, token);
    await expect(row).toBeVisible();

    // An inbound email always lands with `category: null` and a classifier
    // fills it in a later phase, so this is the whole of what the category
    // dropdown can be held to today. It is still the mistake a missing filter
    // makes: ignore the parameter and the uncategorised row stays on screen.
    await chooseFilter(page, "Filter by category", "General Question");
    await expect(page).toHaveURL(
      `/tickets?search=${token}&category=general_question`,
    );
    await expect(row).toBeHidden();
  });

  test("keeps the filters through a refresh, in the URL and in the toolbar", async ({
    page,
    request,
  }) => {
    const token = filterToken();
    const match = await createTicket(request, "reload-match", `Kept ${token}`);
    const other = await createTicket(
      request,
      "reload-other",
      `Dropped ${filterToken()}`,
    );

    await page.goto("/tickets");
    await searchFor(page, token);
    await chooseFilter(page, "Filter by status", "Open");
    await expect(page).toHaveURL(`/tickets?search=${token}&status=open`);

    await page.reload();

    // The filters live in the URL rather than in component state, which is what
    // makes this hold: a reload throws away every piece of state the page had
    // and the URL is all that is left to rebuild the question from.
    await expect(page).toHaveURL(`/tickets?search=${token}&status=open`);
    await expect(ticketRow(page, match.subject)).toBeVisible();
    await expect(ticketRow(page, other.subject)).toBeHidden();

    // And the toolbar reads back what the URL says, so the person can see which
    // filters are on rather than inferring it from the rows.
    await expect(searchBox(page)).toHaveValue(token);
    await expect(
      page.getByRole("combobox", { name: "Filter by status" }),
    ).toHaveText("Open");
  });

  test("undoes the last filter on Back and keeps the one before it", async ({
    page,
    request,
  }) => {
    const token = filterToken();
    const ticket = await createTicket(request, "back-button", `Undo ${token}`);
    const row = ticketRow(page, ticket.subject);

    await page.goto("/tickets");
    await searchFor(page, token);
    await chooseFilter(page, "Filter by status", "Resolved");
    await expect(row).toBeHidden();

    await page.goBack();

    // One filter undone, not both: choosing a dropdown value pushes a history
    // entry, so Back lands on the search alone and the row the status filter
    // had hidden comes back on its own.
    await expect(page).toHaveURL(`/tickets?search=${token}`);
    await expect(row).toBeVisible();
    await expect(searchBox(page)).toHaveValue(token);
    await expect(
      page.getByRole("combobox", { name: "Filter by status" }),
    ).toHaveText("All statuses");
  });

  test("keeps the search when a column header re-sorts the filtered list", async ({
    page,
    request,
  }) => {
    const token = filterToken();
    // Two tickets sharing one token, so the search narrows the table to exactly
    // these two rows. That is the one scope in which this spec may say anything
    // about order: the pair is the whole of the filtered answer, so comparing
    // their positions says nothing about rows another worker inserted.
    const alpha = await createTicket(request, "sort-alpha", `Alpha ${token}`);
    const zulu = await createTicket(request, "sort-zulu", `Zulu ${token}`);

    await page.goto("/tickets");
    await searchFor(page, token);

    const filtered = page.getByRole("row").filter({ hasText: token });
    // Newest first is the default the list has when the URL says nothing, and
    // Zulu was posted second. Asserted before the click so the flip below is a
    // change rather than the order it already had.
    await expect(filtered.nth(0)).toContainText(zulu.subject);
    await expect(filtered.nth(1)).toContainText(alpha.subject);

    await page.getByRole("button", { name: "Subject" }).click();

    // The sort and the filters are one query in one URL, so re-sorting has to
    // carry `?search=` along. The hook builds the next URL by spreading the
    // query it read; built from the sort alone, this click would clear the
    // search box and both dropdowns.
    await expect(page).toHaveURL(
      `/tickets?sortBy=subject&sortOrder=asc&search=${token}`,
    );

    // Still only the two matching rows, and now in the order Postgres was asked
    // for — which is what proves the filter and the sort reached the server
    // together rather than one replacing the other.
    await expect(filtered.nth(0)).toContainText(alpha.subject);
    await expect(filtered.nth(1)).toContainText(zulu.subject);
  });
});

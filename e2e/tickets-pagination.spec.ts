import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { AGENT, signIn } from "./support/auth";
import { createTicketWithSubject, newSearchToken } from "./support/tickets";

/**
 * The pagination footer on `/tickets` in a real browser: the four buttons, the
 * range line, and the three places a page number has to behave — a reload, the
 * back button, and the two controls that are supposed to throw it away.
 *
 * **The rule it is here for is the last one.** `GET /api/tickets` already has
 * its own spec (`tickets-api-pagination.spec.ts`) for what `?page=` answers, so
 * nothing below asserts a field set or a row count coming back over HTTP. What
 * only a browser can show is that the controls are wired to the URL and that a
 * filter or a sort resets the page — `useTicketListQuery` writes `page: 1` into
 * both setters by hand, and no other test in the repo looks at it.
 *
 * **Why counting is legal in this file when the rest of the suite forbids it.**
 * Five workers share one `ticket_management_test` database that `globalSetup`
 * truncates once per *run*, so every ticket any spec posts is on this page too
 * — `support/tickets.ts` spells that out at `newSearchToken`. "Ten rows on page
 * one" over the unfiltered list would therefore be noise. Every test here types
 * a UUID into the search box first, which narrows the table to the eleven rows
 * this file posted and nothing else; inside that set the exact numbers *are*
 * the feature.
 *
 * **It is also what fixed the spec next door.** `tickets-list.spec.ts` used to
 * look for its row on the *unfiltered* page 1, which pagination turned into a
 * position assertion in a list five workers are writing to — measured, its row
 * sat at position 29 after a full run. It now narrows by its own subject the
 * same way this file does, so the trick here is the suite's answer to
 * pagination rather than a local convenience.
 */

// How many rows one page holds, and one more than that so there is a second
// page with exactly one row on it. **Hand-written rather than imported from
// `core/schemas/pagination.ts`**, the same way `tickets-api-pagination.spec.ts`
// writes it out: a spec that read the value under test could never notice the
// app reading the wrong one. Change PAGE_SIZE there and these go red until
// somebody comes and agrees to the new number.
const PAGE_SIZE = 10;
const TICKET_COUNT = PAGE_SIZE + 1;

/**
 * The subject of the nth ticket of a batch, as a pure function, so a test can
 * name the row it means without indexing into an array.
 *
 * The number is padded to two digits, which is what makes **subject order and
 * numeric order the same thing** — unpadded, `10` sorts before `2` as text and
 * the sort test below would be asserting the wrong rows for the right reason.
 * Same shape as the API pagination spec's subjects, deliberately: two files
 * describing one set of fixture rows should describe it the same way.
 */
function subjectFor(token: string, number: number) {
  return `${token} ticket ${String(number).padStart(2, "0")}`;
}

/**
 * Eleven tickets sharing one search token.
 *
 * Posted **one at a time rather than with `Promise.all`**, because `createdAt`
 * (with `id` as the server's second sort key) decides the default order of the
 * list and these rows have to be distinguishable by it: eleven posts landing
 * inside one millisecond would leave the order to the tiebreaker rather than to
 * time, and "the oldest one is alone on page two" would stop being true.
 */
async function createNumberedTickets(request: APIRequestContext) {
  const token = newSearchToken();

  for (let number = 1; number <= TICKET_COUNT; number += 1) {
    // `no-await-in-loop` is disabled for this one line, not for the file and
    // not in the config — the precedent is `readAllTickets` in
    // support/tickets.ts. The rule is about losing parallelism, and losing it
    // is the whole point here: the order these are created in is what the
    // assertions below read.
    // eslint-disable-next-line no-await-in-loop
    await createTicketWithSubject(
      request,
      `pagination-${number}`,
      subjectFor(token, number),
    );
  }

  return token;
}

/** The row a ticket renders into, found by its subject rather than by position. */
function ticketRow(page: Page, subject: string) {
  return page.getByRole("row").filter({ hasText: subject });
}

/**
 * Every row of the narrowed table — the ones carrying this test's token.
 *
 * The header row has no token in it, so this counts body rows only, and it
 * cannot pick up another worker's ticket. That is the whole licence for
 * `toHaveCount` in this file.
 */
function tokenRows(page: Page, token: string) {
  return page.getByRole("row").filter({ hasText: token });
}

function searchBox(page: Page) {
  // The textbox role rather than getByLabel: `aria-label="Search tickets"` is
  // the name the toolbar gives it, and asking for the role keeps this locator
  // off the placeholder, which disappears the moment anything is typed.
  return page.getByRole("textbox", { name: "Search tickets" });
}

/** The footer, as a landmark, so the two text assertions cannot match the table. */
function paginationNav(page: Page) {
  return page.getByRole("navigation", { name: "Pagination" });
}

function pageButton(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

/**
 * Types the token into the search box and waits for it to reach the URL.
 *
 * **The wait is not politeness, it is what keeps these tests off a race.** The
 * box is debounced 300ms, and a control touched inside that window navigates
 * from a query that does not hold the term yet, so the keystroke's own commit
 * lands afterwards and wipes the page number. `tickets-filter.spec.ts`
 * measured that one: three of its tests passed only because the debounce
 * happened to fire last.
 *
 * The expected URL is exact rather than a regex because the list is unsorted
 * and on page 1 at this point, and both of those write no parameters at all —
 * so `?search=` is the whole query string.
 */
async function searchFor(page: Page, token: string) {
  await searchBox(page).fill(token);
  await expect(page).toHaveURL(`/tickets?search=${token}`);
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

/**
 * Built **once for the whole file** rather than per test, which is the
 * arrangement `tickets-api-pagination.spec.ts` already uses for the same eleven
 * rows, and here it buys something beyond speed: eleven webhook posts per test
 * would be sixty-six tickets a run, and every one of them lands at the *front*
 * of the default order. `tickets-list.spec.ts` no longer reads that order — it
 * narrows by its own subject now — but a spec that inflates page one by sixty
 * rows is a thing the next unfiltered assertion anywhere in the suite would
 * trip over, so eleven is the whole budget.
 *
 * `mode: "default"` is what makes one batch enough. The config is
 * `fullyParallel`, which otherwise spreads one file's tests across workers, and
 * module scope is per worker — five workers would each post their own eleven.
 * This pins the file to one worker, in declaration order.
 *
 * It is deliberately **not** `mode: "serial"`: these tests do not depend on one
 * another, so a failure in the first must not skip the rest. Sharing is sound
 * because nothing below writes to a ticket — there is no endpoint that can, and
 * every test only reads the eleven rows and the URL.
 */
test.describe.configure({ mode: "default" });

let createdRows: Promise<string> | undefined;

/**
 * The shared batch's token, posted on first use rather than in a `beforeAll`,
 * so running one test on its own still creates the rows it needs.
 */
function numberedTickets(request: APIRequestContext) {
  createdRows ??= createNumberedTickets(request);
  return createdRows;
}

/** Opens the list narrowed to the eleven fixture rows, on page 1. */
async function openNarrowedList(page: Page, request: APIRequestContext) {
  const token = await numberedTickets(request);
  await signIn(page, AGENT);
  await page.goto("/tickets");
  await searchFor(page, token);
  return token;
}

test.describe("Ticket list — pagination", () => {
  test("splits the matching tickets into a full first page and a second page holding the remainder", async ({
    page,
    request,
  }) => {
    const token = await openNarrowedList(page, request);
    // Newest first is the order the list has when the URL says nothing, so the
    // last ticket posted opens page 1 and the first one posted is the single
    // row pushed onto page 2.
    const newest = ticketRow(page, subjectFor(token, TICKET_COUNT));
    const oldest = ticketRow(page, subjectFor(token, 1));

    await expect(tokenRows(page, token)).toHaveCount(PAGE_SIZE);
    await expect(newest).toBeVisible();
    // The assertion with teeth: eleven rows match the search and the eleventh
    // is **not** on screen, which is what "the server sliced the page" looks
    // like from the outside. Without pagination every one of them would render.
    await expect(oldest).toBeHidden();
    // The footer has to agree with the rows beside it — a range line counting
    // the whole table under ten rows is the way this feature fails quietly.
    await expect(paginationNav(page)).toContainText(
      // En dash (U+2013), not a hyphen: it is a numeric range.
      `Showing 1–${PAGE_SIZE} of ${TICKET_COUNT}`,
    );
    await expect(paginationNav(page)).toContainText("Page 1 of 2");

    await pageButton(page, "Next page").click();

    // Page 1 writes no parameter, so a page number appearing in the URL at all
    // is the proof the button went through the hook rather than through state
    // inside the table.
    await expect(page).toHaveURL(`/tickets?search=${token}&page=2`);
    // The two halves swap over: the rows on page 2 are not the rows from page
    // 1, which is what makes this paging rather than re-rendering the same ten.
    await expect(tokenRows(page, token)).toHaveCount(TICKET_COUNT - PAGE_SIZE);
    await expect(oldest).toBeVisible();
    await expect(newest).toBeHidden();
    await expect(paginationNav(page)).toContainText(
      `Showing ${TICKET_COUNT}–${TICKET_COUNT} of ${TICKET_COUNT}`,
    );
    await expect(paginationNav(page)).toContainText("Page 2 of 2");
  });

  test("still shows the second page after a reload, because the page number is in the URL", async ({
    page,
    request,
  }) => {
    const token = await openNarrowedList(page, request);
    await pageButton(page, "Next page").click();
    await expect(page).toHaveURL(`/tickets?search=${token}&page=2`);

    await page.reload();

    // A reload throws away every piece of state the page had, so this holds
    // only because the page number lives in the URL alongside the search —
    // kept in `useState`, the way the reference project does it, the search
    // would come back and the page would silently revert to 1.
    await expect(page).toHaveURL(`/tickets?search=${token}&page=2`);
    await expect(ticketRow(page, subjectFor(token, 1))).toBeVisible();
    await expect(
      ticketRow(page, subjectFor(token, TICKET_COUNT)),
    ).toBeHidden();
    await expect(paginationNav(page)).toContainText("Page 2 of 2");
    // And the toolbar reads the search back off the URL too, so the person can
    // see which eleven rows they are paging through.
    await expect(searchBox(page)).toHaveValue(token);
  });

  test("returns to the first page on the browser Back button", async ({
    page,
    request,
  }) => {
    const token = await openNarrowedList(page, request);
    await pageButton(page, "Next page").click();
    await expect(page).toHaveURL(`/tickets?search=${token}&page=2`);

    await page.goBack();

    // One press, not several: paging pushes a history entry while the
    // debounced search is written with `replace: true`, so Back steps over the
    // page change and lands on the search itself rather than walking back
    // through the keystrokes that typed it.
    await expect(page).toHaveURL(`/tickets?search=${token}`);
    await expect(tokenRows(page, token)).toHaveCount(PAGE_SIZE);
    await expect(
      ticketRow(page, subjectFor(token, TICKET_COUNT)),
    ).toBeVisible();
    await expect(ticketRow(page, subjectFor(token, 1))).toBeHidden();
  });

  test("goes back to the first page when a status filter is chosen, keeping the search", async ({
    page,
    request,
  }) => {
    const token = await openNarrowedList(page, request);
    await pageButton(page, "Next page").click();
    await expect(page).toHaveURL(`/tickets?search=${token}&page=2`);

    await chooseFilter(page, "Filter by status", "Open");

    // `?page=` gone and `?search=` still there, which is the whole rule:
    // `setFilters` spreads the current query so the search survives, then
    // forces `page: 1` last so the page cannot. Page 4 of an unfiltered list
    // is a page the narrowed list may not have at all, and landing on an empty
    // table with a full toolbar says nothing about why.
    await expect(page).toHaveURL(`/tickets?search=${token}&status=open`);
    // Every ticket the webhook writes is open, so the status narrows nothing
    // here — which is what makes this a clean test of the page reset: the
    // eleven rows and the two pages are exactly as they were, and only the
    // page number moved.
    await expect(tokenRows(page, token)).toHaveCount(PAGE_SIZE);
    await expect(paginationNav(page)).toContainText(
      `Showing 1–${PAGE_SIZE} of ${TICKET_COUNT}`,
    );
    // The row that can only be on page 1, and the row that was alone on page
    // 2 — asserted as a pair so this cannot pass on a page that merely
    // re-rendered.
    await expect(
      ticketRow(page, subjectFor(token, TICKET_COUNT)),
    ).toBeVisible();
    await expect(ticketRow(page, subjectFor(token, 1))).toBeHidden();
  });

  test("goes back to the first page when a column header re-sorts, keeping the search", async ({
    page,
    request,
  }) => {
    const token = await openNarrowedList(page, request);
    await pageButton(page, "Next page").click();
    await expect(page).toHaveURL(`/tickets?search=${token}&page=2`);

    await page.getByRole("button", { name: "Subject" }).click();

    // Same rule as the filter above, in `onSortingChange` instead: the sort
    // and the search are one query in one URL, and page 3 of one order is not
    // page 3 of another — the rows that were on it are scattered through the
    // whole list once the order changes.
    await expect(page).toHaveURL(
      `/tickets?sortBy=subject&sortOrder=asc&search=${token}`,
    );
    await expect(tokenRows(page, token)).toHaveCount(PAGE_SIZE);
    await expect(paginationNav(page)).toContainText("Page 1 of 2");
    // Subjects are numbered with a leading zero, so ascending by subject is
    // `01`…`10` on page 1 — which makes these two assertions prove both halves
    // at once. Ticket 02 was not on the page 2 this click came from, so it
    // being here is the page reset; ticket 11 would open page 1 in the default
    // order, so it being gone is the new sort.
    await expect(ticketRow(page, subjectFor(token, 2))).toBeVisible();
    await expect(
      ticketRow(page, subjectFor(token, TICKET_COUNT)),
    ).toBeHidden();
  });

  test("disables the backward buttons on the first page and the forward ones on the last", async ({
    page,
    request,
  }) => {
    const token = await openNarrowedList(page, request);
    const first = pageButton(page, "First page");
    const previous = pageButton(page, "Previous page");
    const next = pageButton(page, "Next page");
    const last = pageButton(page, "Last page");

    // There is nowhere before page 1, and the footer says so rather than
    // offering a click that would ask the server for page 0 — which the schema
    // refuses with a 400, so this is the control that keeps a legitimate click
    // off an error state.
    await expect(first).toBeDisabled();
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();
    await expect(last).toBeEnabled();

    // Via Last rather than Next, so the two buttons that share
    // `getCanLastPage()` / `getCanNextPage()` are both exercised somewhere.
    await last.click();
    await expect(page).toHaveURL(`/tickets?search=${token}&page=2`);

    await expect(first).toBeEnabled();
    await expect(previous).toBeEnabled();
    await expect(next).toBeDisabled();
    await expect(last).toBeDisabled();

    // And back out again, which is also the one assertion that page 1 writes
    // no `?page=` even when it was arrived at by a button rather than by
    // loading a bare URL.
    await first.click();
    await expect(page).toHaveURL(`/tickets?search=${token}`);
    await expect(previous).toBeDisabled();
  });
});

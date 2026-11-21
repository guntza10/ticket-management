import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { API_URL } from "./auth";

// Exactly the fields `GET /api/users` selects. Asserting the key set — not just
// that the expected values are present — is what turns this into a test of the
// allow-list: a bare findMany would ship every column the table happens to
// have, including whatever the next migration adds.
export const ALLOWED_FIELDS = [
  "createdAt",
  "deletedAt",
  "email",
  "id",
  "name",
  "role",
];

/**
 * One row of the roster, in the shape the endpoint answers. Hand-written rather
 * than derived from `ALLOWED_FIELDS` above, which is a list of names and not a
 * type — and keeping them apart is what lets the field-set specs assert the
 * names while these specs read the values.
 */
export type RosterRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  deletedAt: string | null;
};

/** One page of the roster, exactly as the endpoint answers it. */
export async function readUserPage(
  request: APIRequestContext,
  params?: Record<string, string>,
) {
  const response = await request.get(`${API_URL}/api/users`, params && { params });

  expect(response.status()).toBe(200);
  return (await response.json()) as { users: RosterRow[]; total: number };
}

/**
 * **Every account on the roster, across every page.**
 *
 * It exists because `?page=` arrived on 2026-11-21 and four specs read the
 * roster to answer "is the row I just wrote really stored" — a question about
 * the whole roster, not about its first ten rows. The roster is ordered
 * `createdAt asc`, so **a freshly created account is on the *last* page**,
 * which makes this the sharper case of the two lists: capping at page one
 * would have turned `toContain` red and, worse, made every
 * `not.toContain` pass for the wrong reason.
 *
 * Unlike the ticket list, inserts here land at the *end* of the order, so
 * paging forward can neither skip nor duplicate a row — a row added mid-read
 * appears on a later page or not at all. Still no count, length or position
 * assertions: `newUserEmail` above explains why.
 */
export async function readAllUsers(request: APIRequestContext) {
  const rows: RosterRow[] = [];

  for (let page = 1; ; page += 1) {
    // Far past anything a run creates, so reaching it means the exits below
    // are wrong rather than the roster being large.
    expect(page, "readAllUsers paged far past the end").toBeLessThan(50);

    // Disabled for this line only — see the matching note in support/tickets.ts:
    // page N+1 cannot be asked for until page N has answered.
    // eslint-disable-next-line no-await-in-loop
    const { users, total } = await readUserPage(request, { page: String(page) });
    rows.push(...users);

    if (users.length === 0 || rows.length >= total) return rows;
  }
}

/** The addresses on the roster, which is what most specs actually assert on. */
export async function readAllUserEmails(request: APIRequestContext) {
  return (await readAllUsers(request)).map((user) => user.email);
}

/**
 * Which page of the roster holds a given address, 1-based.
 *
 * **Pagination is why this exists (2026-11-21).** `GET /api/users` answers ten
 * rows at a time ordered `createdAt asc`, so page one is the ten *oldest*
 * accounts and a row a spec just created is on the **last** page. Every browser
 * spec that creates a row and then looks for it on `/users` was asserting a
 * position in a list five workers are appending to: measured over a full run of
 * 43 users, `edit-user`'s rows landed at 11 and 12 — page two — and went red,
 * while `create-user`'s landed at 5 and passed. Same code, different worker
 * order.
 *
 * It asks the endpoint rather than dividing an index by a page size, so there
 * is no copy of `PAGE_SIZE` here to disagree with the server's.
 *
 * **The answer is stable once it is known**, which is what makes it usable in a
 * shared database: the order is ascending by creation time, so rows arriving
 * later are appended *after* this one and never shift it to another page.
 */
export async function findUserRosterPage(
  request: APIRequestContext,
  email: string,
) {
  let seen = 0;

  for (let page = 1; ; page += 1) {
    expect(page, `${email} was not on any page of the roster`).toBeLessThan(50);

    // Sequential by necessity — see the note in support/tickets.ts.
    // eslint-disable-next-line no-await-in-loop
    const { users, total } = await readUserPage(request, { page: String(page) });
    if (users.some((user) => user.email === email)) return page;

    // Rows counted as they arrive rather than derived from the page number: a
    // short page means the end, and multiplying a page number by a page length
    // is arithmetic that happens to terminate rather than a reason to stop.
    seen += users.length;
    if (users.length === 0 || seen >= total) {
      throw new Error(`${email} is not on the roster at all`);
    }
  }
}

/**
 * Opens `/users` on the page that actually holds the given address.
 *
 * The one-line replacement for `page.goto("/users")` in any browser spec that
 * then looks for a row it created. It needs an **admin** session on the request
 * context as well as in the browser: the lookup goes through the same
 * admin-only endpoint the page does.
 *
 * Page one is spelled as a bare `/users`, the way the app writes it — a URL
 * carrying `?page=1` is one the app itself never produces, and a spec should
 * drive what the app drives.
 */
export async function gotoRosterPageFor(
  page: Page,
  request: APIRequestContext,
  email: string,
) {
  const rosterPage = await findUserRosterPage(request, email);
  await page.goto(rosterPage === 1 ? "/users" : `/users?page=${rosterPage}`);
}

/** The password every spec-created account is given. Long enough for the rule. */
export const NEW_USER_PASSWORD = "password1234";

/**
 * A unique address for a row a spec is about to create.
 *
 * `playwright.config.ts` is `fullyParallel` with five workers against one
 * `ticket_management_test` database, and `globalSetup` truncates once per run
 * rather than per spec — so anything a spec inserts is visible to every other
 * spec in that run. Every created row therefore needs an address no other
 * worker could pick. A timestamp is not enough: five workers can start inside
 * the same millisecond.
 *
 * The flip side of the same rule: no spec may assert a roster length, a row
 * count, or an order, because another worker's row can appear at any moment.
 */
export function newUserEmail(label: string) {
  return `created-${label}-${crypto.randomUUID()}@test.local`;
}

/**
 * Creates a user over HTTP and hands back what a spec needs to edit it. The
 * request context must already hold an admin session (`signInViaApi`).
 *
 * Every PATCH spec needs a row it is free to change, and must not reach for a
 * seeded account: the whole run shares one database, so renaming ADMIN or
 * AGENT would pull the ground out from under every other worker.
 */
export async function createUserViaApi(
  request: APIRequestContext,
  label: string,
) {
  const email = newUserEmail(label);
  // The name is returned alongside the address because a UI spec has to assert
  // on it — the edit dialog is prefilled with the row's name and its trigger is
  // named "Edit <that name>". Deriving it a second time in the spec would be a
  // second definition of the same string.
  const name = `Created ${label}`;
  const response = await request.post(`${API_URL}/api/users`, {
    data: { name, email, password: NEW_USER_PASSWORD },
  });

  // Fail here rather than three lines later on a confusing 404 from the PATCH.
  expect(response.status()).toBe(201);
  const { user } = (await response.json()) as { user: { id: string } };

  return { id: user.id, name, email, password: NEW_USER_PASSWORD };
}

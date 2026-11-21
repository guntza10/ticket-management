import { test, expect, type APIRequestContext } from "@playwright/test";
import { ADMIN, API_URL, signInViaApi } from "./support/auth";
import {
  ALLOWED_FIELDS,
  createUserViaApi,
  readAllUsers,
  readUserPage,
} from "./support/users";

// Hand-written rather than imported from `core/schemas/pagination.ts`, for the
// same reason `ALLOWED_FIELDS` is: a spec that read the value under test could
// not notice the server reading the wrong one.
const PAGE_SIZE = 10;

/** One more than a page, so this file's own rows guarantee a second page. */
const USER_COUNT = PAGE_SIZE + 1;

/**
 * Eleven accounts, created by this file.
 *
 * **The roster has no filter**, so unlike the ticket list there is no way to
 * narrow the answer to rows this file owns — every assertion below has to
 * survive the other four workers creating accounts at the same time. That
 * rules out exact counts and positions, and it is why these tests ask about
 * *this file's eleven addresses* rather than about the roster's shape: "every
 * one of them is reachable by paging, exactly once".
 *
 * Eleven is still what makes the file worth having: it guarantees a second page
 * exists even if this worker runs first and the roster holds nothing but the
 * two seeded accounts.
 */
async function createNumberedUsers(request: APIRequestContext) {
  await signInViaApi(request, ADMIN);
  const created = [];

  for (let number = 1; number <= USER_COUNT; number += 1) {
    // Sequential because `createdAt` is the roster's order and
    // `createUserViaApi` hashes a password with Argon2 — eleven of those at
    // once is a thundering herd against the one dev Postgres, for no gain.
    // eslint-disable-next-line no-await-in-loop
    const user = await createUserViaApi(
      request,
      `pagination-${String(number).padStart(2, "0")}`,
    );
    created.push(user);
  }

  return created;
}

// One set of accounts for the whole file: eleven creates is the most expensive
// setup here, and `mode: "serial"` is what keeps the config's `fullyParallel`
// from spreading these tests across workers, where module scope is not shared.
test.describe.configure({ mode: "serial" });

let createdRows: Promise<{ id: string; email: string }[]> | undefined;

function numberedUsers(request: APIRequestContext) {
  createdRows ??= createNumberedUsers(request);
  return createdRows;
}

test.describe("Users API — pagination", () => {
  test("answers one page of rows and the count of the whole roster", async ({
    request,
  }) => {
    const created = await numberedUsers(request);

    await signInViaApi(request, ADMIN);
    const { users, total } = await readUserPage(request);

    // Exactly a page, which is safe to assert here only because this file put
    // eleven rows in the roster itself — the two seeded accounts alone would
    // make one short page.
    expect(users).toHaveLength(PAGE_SIZE);
    expect(total).toBeGreaterThanOrEqual(created.length);
  });

  test("every account is reachable by paging, exactly once", async ({
    request,
  }) => {
    const created = await numberedUsers(request);

    await signInViaApi(request, ADMIN);
    const emails = (await readAllUsers(request)).map((user) => user.email);

    // The assertion that makes pagination trustworthy rather than merely
    // present: a `skip` off by one, or a `total` that disagrees with the rows,
    // loses a row at a page boundary or serves it twice. Counting occurrences
    // of *this file's* addresses catches both without asserting anything about
    // the roster's length, which other workers are changing.
    //
    // What it does **not** cover is the count: `readAllUsers` stops paging when
    // it has as many rows as `total` says, so an *understated* total makes it
    // stop early and this test still passes. Measured 2026-11-21 — giving
    // `count()` a `where: { deletedAt: null }` left it green. The test below is
    // the one that closes that, and it had to page without consulting `total`
    // at all to do it.
    for (const user of created) {
      expect(emails.filter((email) => email === user.email)).toHaveLength(1);
    }
  });

  test("answers a page past the end with no rows and the same count", async ({
    request,
  }) => {
    await numberedUsers(request);

    await signInViaApi(request, ADMIN);
    const { total } = await readUserPage(request);
    const pastEnd = Math.ceil(total / PAGE_SIZE) + 1;

    const answer = await readUserPage(request, { page: String(pastEnd) });

    expect(answer.users).toEqual([]);
    // `toBeGreaterThanOrEqual` rather than equal: another worker may have
    // created an account between the two requests, and this test is about the
    // empty page, not about the number.
    expect(answer.total).toBeGreaterThanOrEqual(total);
  });

  test("every row on the last page carries the roster's fields and nothing else", async ({
    request,
  }) => {
    await numberedUsers(request);

    await signInViaApi(request, ADMIN);
    const { total } = await readUserPage(request);
    const lastPage = Math.ceil(total / PAGE_SIZE);

    const { users } = await readUserPage(request, { page: String(lastPage) });

    // Asserted on a page `skip` had to walk to, not on page one: the allow-list
    // and the slice are arguments to the same `findMany`, so a `select` lost
    // while adding pagination would show here.
    expect(users).not.toHaveLength(0);
    for (const user of users) {
      expect(Object.keys(user).sort()).toEqual(ALLOWED_FIELDS);
    }
  });

  /**
   * Every row the roster will hand over, read **without consulting `total`** —
   * it stops when a page comes back short, which is the only signal that does
   * not come from the number under test.
   *
   * `readAllUsers` in support/ cannot be used here for exactly that reason: it
   * trusts `total` to know when to stop, so it cannot notice a `total` that is
   * wrong. This is the one test that needs that independence; a second caller
   * would move it down beside the other helper.
   */
  async function readEveryPageIgnoringTotal(request: APIRequestContext) {
    const rows: { email: string }[] = [];

    for (let page = 1; ; page += 1) {
      expect(page, "paged far past the end").toBeLessThan(50);
      // eslint-disable-next-line no-await-in-loop
      const { users } = await readUserPage(request, { page: String(page) });
      rows.push(...users);
      if (users.length < PAGE_SIZE) return rows;
    }
  }

  // Deliberately last in the file: it soft-deletes one of the eleven accounts
  // above, and `mode: "serial"` means every test that asserts on the full set
  // has already run. A deleted row stays on the roster — muted and badged on
  // the client — so nothing earlier would break either way, but the ordering is
  // worth keeping on purpose rather than by luck.
  test("counts soft-deleted accounts, so the last page stays reachable", async ({
    request,
  }) => {
    const created = await numberedUsers(request);
    const [victim] = created;

    await signInViaApi(request, ADMIN);
    const deleted = await request.delete(`${API_URL}/api/users/${victim?.id}`);
    expect(deleted.status()).toBe(200);

    // Rows first, count second, and the order is what makes this safe in a
    // database five workers are writing to: another worker creating an account
    // in between can only make `total` *larger*, which is the direction this
    // assertion does not care about.
    const rows = await readEveryPageIgnoringTotal(request);
    const { total } = await readUserPage(request);

    // `GET /api/users` returns soft-deleted rows on purpose, so the count beside
    // them has to include them too. Give `count()` a `deletedAt: null` filter
    // and the client is told there are fewer rows than the endpoint will hand
    // over — the footer short-changes the page count and the last page becomes
    // unreachable by clicking Next. Measured 2026-11-21: that edit turns this
    // test red and nothing else in the suite.
    expect(rows.map((user) => user.email)).toContain(victim?.email);
    expect(total).toBeGreaterThanOrEqual(rows.length);
  });

  for (const page of ["0", "-1", "1.5", "abc", ""]) {
    test(`refuses ?page=${page || "(empty)"} with 400 invalid_query`, async ({
      request,
    }) => {
      await signInViaApi(request, ADMIN);
      const response = await request.get(`${API_URL}/api/users`, {
        params: { page },
      });

      // The roster took no query parameters at all until pagination, so this is
      // the first thing it can refuse — and it refuses with the same code the
      // ticket list uses, which is the point of parsing it through the shared
      // `pageQuerySchema` rather than reading `req.query.page` by hand.
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_query" });
    });
  }
});

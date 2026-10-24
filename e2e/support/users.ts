import { expect, type APIRequestContext } from "@playwright/test";
import { API_URL } from "./auth";

// Exactly the fields `GET /api/users` selects. Asserting the key set — not just
// that the expected values are present — is what turns this into a test of the
// allow-list: a bare findMany would ship every column the table happens to
// have, including whatever the next migration adds.
export const ALLOWED_FIELDS = ["createdAt", "email", "id", "name", "role"];

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

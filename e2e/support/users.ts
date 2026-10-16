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

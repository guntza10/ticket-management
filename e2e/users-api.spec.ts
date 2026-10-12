import { test, expect } from "@playwright/test";
import { ADMIN, AGENT, API_URL, signInViaApi } from "./support/auth";

// Exactly the fields `GET /api/users` selects. Asserting the key set — not just
// that the expected values are present — is what turns this into a test of the
// allow-list: a bare findMany would ship every column the table happens to
// have, including whatever the next migration adds.
const ALLOWED_FIELDS = ["createdAt", "email", "id", "name", "role"];

test.describe("Users API — authorization", () => {
  test("GET /api/users is 401 without a session", async ({ request }) => {
    const response = await request.get(`${API_URL}/api/users`);

    expect(response.status()).toBe(401);
  });

  // 403, not 401. An agent *is* authenticated, so telling them to sign in would
  // be wrong twice over: it misreports the problem, and signing in again would
  // never grant the access. The client routes an agent away from /users too,
  // but that is a UX guard — this is the one that actually refuses.
  test("GET /api/users is 403 for an agent session", async ({ request }) => {
    await signInViaApi(request, AGENT);

    const response = await request.get(`${API_URL}/api/users`);

    expect(response.status()).toBe(403);
  });

  test("GET /api/users returns the roster to an admin", async ({ request }) => {
    await signInViaApi(request, ADMIN);

    const response = await request.get(`${API_URL}/api/users`);

    expect(response.status()).toBe(200);
    const { users } = (await response.json()) as {
      users: Record<string, unknown>[];
    };

    // Order-independent on purpose: both seeded accounts are created in the
    // same run, so asserting a position would hang the suite's health on
    // timestamp resolution.
    expect(users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: ADMIN.email,
          name: ADMIN.name,
          role: "admin",
        }),
        expect.objectContaining({
          email: AGENT.email,
          name: AGENT.name,
          role: "agent",
        }),
      ]),
    );

    // Every row, not a sample: the allow-list has to hold for all of them.
    for (const user of users) {
      expect(Object.keys(user).sort()).toEqual(ALLOWED_FIELDS);
    }
  });
});

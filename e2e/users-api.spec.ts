import { test, expect } from "@playwright/test";
import {
  ADMIN,
  AGENT,
  API_URL,
  CLIENT_ORIGIN,
  signInViaApi,
} from "./support/auth";
import { NEW_USER_PASSWORD, newUserEmail } from "./support/users";

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

// Every test below that inserts a row uses newUserEmail(), because the whole
// run shares one database — see support/users.ts. None of them asserts a
// roster count for the same reason.
test.describe("Users API — creating", () => {
  test("POST /api/users creates an agent the new user can sign in with", async ({
    request,
  }) => {
    await signInViaApi(request, ADMIN);

    // Sent with capitals on purpose. /sign-in/email looks a user up by
    // email.toLowerCase(), so an address stored as typed would belong to an
    // account that can never sign in — and the case-sensitive unique index
    // would let it sit beside the lowercase one rather than reject it.
    const typedEmail = newUserEmail("signs-in").toUpperCase();
    const storedEmail = typedEmail.toLowerCase();

    const response = await request.post(`${API_URL}/api/users`, {
      data: {
        name: "New Hire",
        email: typedEmail,
        password: NEW_USER_PASSWORD,
      },
    });

    expect(response.status()).toBe(201);
    const { user } = (await response.json()) as {
      user: Record<string, unknown>;
    };
    // Same allow-list GET answers with, so one constant covers both.
    expect(Object.keys(user).sort()).toEqual(ALLOWED_FIELDS);
    expect(user).toMatchObject({
      name: "New Hire",
      email: storedEmail,
      role: "agent",
    });

    // Really in the roster, not merely echoed back by the handler.
    const roster = await request.get(`${API_URL}/api/users`);
    const { users } = (await roster.json()) as { users: { email: string }[] };
    expect(users.map((u) => u.email)).toContain(storedEmail);

    // Last step on purpose: signing in replaces the admin cookie on this
    // request context. Uses the address as typed — capitals and all — which is
    // what proves the stored row is reachable from what a person would enter.
    const signIn = await request.post(`${API_URL}/api/auth/sign-in/email`, {
      headers: { origin: CLIENT_ORIGIN },
      data: { email: typedEmail, password: NEW_USER_PASSWORD },
    });

    expect(signIn.status()).toBe(200);
  });

  test("POST /api/users forces the agent role on a body asking for admin", async ({
    request,
  }) => {
    await signInViaApi(request, ADMIN);

    const response = await request.post(`${API_URL}/api/users`, {
      data: {
        name: "Escalation Attempt",
        email: newUserEmail("escalation"),
        password: NEW_USER_PASSWORD,
        role: "admin",
      },
    });

    // Ignored rather than refused: zod strips keys it does not know, so an
    // extra field is not an error. It must not reach the row either.
    expect(response.status()).toBe(201);
    const { user } = (await response.json()) as { user: { role: string } };
    expect(user.role).toBe("agent");
  });
});

test.describe("Users API — creating, refused", () => {
  test("POST /api/users is 401 without a session", async ({ request }) => {
    const response = await request.post(`${API_URL}/api/users`, {
      data: {
        name: "No Session",
        email: newUserEmail("no-session"),
        password: NEW_USER_PASSWORD,
      },
    });

    expect(response.status()).toBe(401);
  });

  // 403, not 401 — the same split GET enforces. An agent is authenticated, so
  // the answer is that they may not do this, not that they should sign in again.
  test("POST /api/users is 403 for an agent session", async ({ request }) => {
    await signInViaApi(request, AGENT);

    const response = await request.post(`${API_URL}/api/users`, {
      data: {
        name: "Agent Attempt",
        email: newUserEmail("agent-attempt"),
        password: NEW_USER_PASSWORD,
      },
    });

    expect(response.status()).toBe(403);
  });
});

test.describe("Users API — creating, rejected input", () => {
  test("POST /api/users is 409 when the email already exists", async ({
    request,
  }) => {
    await signInViaApi(request, ADMIN);

    const response = await request.post(`${API_URL}/api/users`, {
      data: {
        name: "Duplicate",
        email: ADMIN.email,
        password: NEW_USER_PASSWORD,
      },
    });

    expect(response.status()).toBe(409);
    expect(await response.json()).toEqual({ error: "email_taken" });
  });

  test("POST /api/users treats a differently-cased email as a duplicate", async ({
    request,
  }) => {
    await signInViaApi(request, ADMIN);

    const response = await request.post(`${API_URL}/api/users`, {
      data: {
        name: "Shouty Duplicate",
        email: ADMIN.email.toUpperCase(),
        password: NEW_USER_PASSWORD,
      },
    });

    // Without the schema's .toLowerCase() this answers 201 and a second admin
    // address appears in the table, because the unique index compares bytes.
    expect(response.status()).toBe(409);
  });

  // Not a duplicate-schema guard any more: core/schemas/users.ts has been the
  // single definition since the client stopped keeping its own copy. What this
  // still proves is that the rule is enforced *here* — the form is reachable by
  // curl, so a rule the client parses and the server does not is no rule at all.
  // Relax .min(8) in core and this is the test that goes red.
  test("POST /api/users is 400 when the password is shorter than 8 characters", async ({
    request,
  }) => {
    await signInViaApi(request, ADMIN);
    const email = newUserEmail("short-password");

    const response = await request.post(`${API_URL}/api/users`, {
      data: { name: "Too Short", email, password: "1234567" },
    });

    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_body" });

    // A 400 that still wrote the row would be worse than no validation at all.
    const roster = await request.get(`${API_URL}/api/users`);
    const { users } = (await roster.json()) as { users: { email: string }[] };
    expect(users.map((u) => u.email)).not.toContain(email);
  });

  test("POST /api/users is 400 for a malformed email", async ({ request }) => {
    await signInViaApi(request, ADMIN);

    const response = await request.post(`${API_URL}/api/users`, {
      data: {
        name: "Bad Address",
        email: "not-an-email",
        password: NEW_USER_PASSWORD,
      },
    });

    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_body" });
  });
});

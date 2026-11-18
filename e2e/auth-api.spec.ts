import { test, expect } from "@playwright/test";
import { ADMIN, AGENT, API_URL, CLIENT_ORIGIN } from "./support/auth";
import { TICKETS_URL } from "./support/tickets";

/**
 * These specs asked `GET /api/me` the two questions below until 2026-11-19,
 * when that route was deleted. It was scaffolding — no part of the app ever
 * called it, only this suite did — so every spec here was proving the guard on
 * a route that existed for the specs' benefit.
 *
 * The two questions turned out to belong to different routes, which is why one
 * replacement would not do:
 *
 *   - **"is this cookie a session?"** goes to `GET /api/tickets`, a real route
 *     an agent reaches, guarded by `requireAuth` alone. It answers **401**
 *     without one.
 *   - **"who is signed in?"** goes to Better Auth's own
 *     `GET /api/auth/get-session`, which is what the client's `useSession`
 *     calls. It cannot answer the first question: measured 2026-11-19, with no
 *     session it answers **200 with a body of `null`**, not 401 — so a spec
 *     asserting a refusal there would assert nothing.
 */
test.describe("Auth API — the session guard", () => {
  test("a guarded route is 401 without a session", async ({ request }) => {
    const response = await request.get(TICKETS_URL);

    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
  });

  test("the session says who signed in, with their role", async ({
    request,
  }) => {
    const signInResponse = await request.post(
      `${API_URL}/api/auth/sign-in/email`,
      {
        headers: { origin: CLIENT_ORIGIN },
        data: { email: AGENT.email, password: AGENT.password },
      },
    );
    expect(signInResponse.status()).toBe(200);

    const response = await request.get(`${API_URL}/api/auth/get-session`);

    expect(response.status()).toBe(200);
    // `role` is the half worth pinning: it only reaches this object because
    // auth.ts declares it in `user.additionalFields`, and without that
    // declaration every session would answer with the field simply missing.
    expect(await response.json()).toMatchObject({
      user: { email: AGENT.email, name: AGENT.name, role: "agent" },
    });
  });
});

test.describe("Auth API — credentials", () => {
  test("refuses public sign-up and leaves no usable account behind", async ({
    request,
  }) => {
    // Unique per run: if sign-up were ever to succeed, this test fails loudly
    // instead of quietly reusing a leftover account from an earlier run.
    const email = `public-signup-${Date.now()}@test.local`;
    const password = "password1234";

    const signUpResponse = await request.post(
      `${API_URL}/api/auth/sign-up/email`,
      {
        headers: { origin: CLIENT_ORIGIN },
        data: { name: "Should Not Exist", email, password },
      },
    );

    // 400 with this code (not a 404) is what proves the route exists and
    // refuses on purpose, rather than the request having missed the endpoint.
    expect(signUpResponse.status()).toBe(400);
    expect(await signUpResponse.json()).toMatchObject({
      code: "EMAIL_PASSWORD_SIGN_UP_DISABLED",
    });

    const signInResponse = await request.post(
      `${API_URL}/api/auth/sign-in/email`,
      {
        headers: { origin: CLIENT_ORIGIN },
        data: { email, password },
      },
    );

    expect(signInResponse.status()).toBeGreaterThanOrEqual(400);

    // No session was created for the address either.
    expect((await request.get(TICKETS_URL)).status()).toBe(401);
  });

  test("normalises the email case on sign-in", async ({ request }) => {
    const signInResponse = await request.post(
      `${API_URL}/api/auth/sign-in/email`,
      {
        headers: { origin: CLIENT_ORIGIN },
        data: { email: ADMIN.email.toUpperCase(), password: ADMIN.password },
      },
    );

    expect(signInResponse.status()).toBe(200);
    // Read back through get-session: the point is which row the upper-cased
    // address resolved to, which only an answer carrying the email can show.
    const session = await request.get(`${API_URL}/api/auth/get-session`);
    expect(await session.json()).toMatchObject({
      user: { email: ADMIN.email, role: "admin" },
    });
  });

  test("refuses a space-padded email as malformed", async ({ request }) => {
    const response = await request.post(`${API_URL}/api/auth/sign-in/email`, {
      headers: { origin: CLIENT_ORIGIN },
      data: { email: ` ${ADMIN.email} `, password: ADMIN.password },
    });

    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_EMAIL" });
  });

  test("rejects a valid email with the wrong password", async ({ request }) => {
    const response = await request.post(`${API_URL}/api/auth/sign-in/email`, {
      headers: { origin: CLIENT_ORIGIN },
      data: { email: ADMIN.email, password: "wrong-password" },
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);

    expect((await request.get(TICKETS_URL)).status()).toBe(401);
  });
});

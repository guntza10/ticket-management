import { test, expect } from "@playwright/test";
import { ADMIN, AGENT, API_URL } from "./support/auth";

// API-level calls present the SPA's origin the way the browser would.
const CLIENT_ORIGIN = "http://localhost:5174";

test.describe("Auth API — /api/me", () => {
  test("GET /api/me is 401 without a session", async ({ request }) => {
    const response = await request.get(`${API_URL}/api/me`);

    expect(response.status()).toBe(401);
  });

  test("GET /api/me returns the signed-in user's email and role", async ({
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

    const response = await request.get(`${API_URL}/api/me`);

    expect(response.status()).toBe(200);
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
    const me = await request.get(`${API_URL}/api/me`);
    expect(me.status()).toBe(401);
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
    const me = await request.get(`${API_URL}/api/me`);
    expect(await me.json()).toMatchObject({
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

    const me = await request.get(`${API_URL}/api/me`);
    expect(me.status()).toBe(401);
  });
});

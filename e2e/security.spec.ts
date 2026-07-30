import { test, expect, type APIResponse } from "@playwright/test";
import { ADMIN, API_URL, signIn } from "./support/auth";

const CLIENT_ORIGIN = "http://localhost:5174";
const FOREIGN_ORIGIN = "http://evil.local";

const credentials = { email: ADMIN.email, password: ADMIN.password };

/** The Set-Cookie headers on a response — a refused sign-in must have none. */
function setCookieHeaders(response: APIResponse) {
  return response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie");
}

test.describe("Session cookie", () => {
  test("is not readable by scripts running in the page", async ({ page }) => {
    await signIn(page, ADMIN);

    // Cookies are not isolated by port: the cookie the API set on
    // localhost:3001 would be visible to this page on localhost:5174 if it
    // were not httpOnly — so document.cookie is a real test of the property.
    const sessionCookie = (await page.context().cookies()).find((cookie) =>
      cookie.name.includes("session"),
    );
    expect(sessionCookie, "expected a session cookie after signing in").toBeDefined();

    const scriptVisibleCookies = await page.evaluate(() => document.cookie);
    expect(scriptVisibleCookies).not.toContain(sessionCookie?.name);
    expect(scriptVisibleCookies).not.toContain(sessionCookie?.value);

    // ...and the session is genuinely working, so the assertion above is not
    // passing merely because the user is signed out.
    const me = await page.request.get(`${API_URL}/api/me`);
    expect(me.status()).toBe(200);
  });

  test("is rejected once its signature is tampered with", async ({
    request,
    playwright,
  }) => {
    await request.post(`${API_URL}/api/auth/sign-in/email`, {
      headers: { origin: CLIENT_ORIGIN },
      data: { email: ADMIN.email, password: ADMIN.password },
    });
    const { cookies } = await request.storageState();
    const sessionCookie = cookies.find((cookie) =>
      cookie.name.includes("session"),
    );
    expect(sessionCookie, "expected a session cookie after signing in").toBeDefined();

    const valid = `${sessionCookie?.name}=${sessionCookie?.value}`;
    const tampered = `${valid.slice(0, -3)}xyz`;

    // A context of its own, so only the cookie set here is sent.
    const context = await playwright.request.newContext();
    try {
      const tamperedResponse = await context.get(`${API_URL}/api/me`, {
        headers: { cookie: tampered },
      });
      expect(tamperedResponse.status()).toBe(401);

      // Control: the untouched cookie is accepted, which proves the 401 above
      // comes from the tampering and not from the way this request is built.
      const validResponse = await context.get(`${API_URL}/api/me`, {
        headers: { cookie: valid },
      });
      expect(validResponse.status()).toBe(200);
    } finally {
      await context.dispose();
    }
  });
});

// The next two describes are a deliberate pair: a foreign origin meets two
// different gates, and they behave in opposite ways.
//
//   CORS         — the browser's gate. The server runs the request and answers
//                  normally (200, real data); it simply never names the foreign
//                  origin in access-control-allow-origin, so the browser
//                  refuses to hand that answer to the attacker's page.
//   trustedOrigins — Better Auth's server-side CSRF gate. Nothing runs: the
//                  request is refused with 403 and no session is issued.
//
// Read them together — "200 without the header" vs "403 with no cookie" is the
// whole distinction.

test.describe("CORS — the browser-side gate (200, permission withheld)", () => {
  test("answers a foreign origin but never grants it read permission", async ({
    request,
  }) => {
    await request.post(`${API_URL}/api/auth/sign-in/email`, {
      headers: { origin: CLIENT_ORIGIN },
      data: credentials,
    });

    const response = await request.get(`${API_URL}/api/me`, {
      headers: { origin: FOREIGN_ORIGIN },
    });

    // The server did the work — CORS withholds permission, it does not refuse.
    expect(response.status()).toBe(200);

    const allowedOrigin = response.headers()["access-control-allow-origin"];
    expect(allowedOrigin).not.toBe(FOREIGN_ORIGIN);
    expect(allowedOrigin).toBe(CLIENT_ORIGIN);
  });

  test("does not grant a foreign origin permission at the preflight", async ({
    request,
  }) => {
    const preflight = await request.fetch(`${API_URL}/api/auth/sign-in/email`, {
      method: "OPTIONS",
      headers: {
        origin: FOREIGN_ORIGIN,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });

    const allowedOrigin = preflight.headers()["access-control-allow-origin"];
    expect(allowedOrigin).not.toBe(FOREIGN_ORIGIN);
    expect(allowedOrigin).toBe(CLIENT_ORIGIN);
  });
});

test.describe("trustedOrigins — the server-side CSRF gate (403, refused)", () => {
  test("refuses a sign-in from a foreign origin and issues no session", async ({
    request,
  }) => {
    const response = await request.post(`${API_URL}/api/auth/sign-in/email`, {
      headers: { origin: FOREIGN_ORIGIN },
      data: credentials,
    });

    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({ code: "INVALID_ORIGIN" });

    // Refused means refused: no credential was ever handed back.
    expect(setCookieHeaders(response)).toHaveLength(0);
    const { cookies } = await request.storageState();
    expect(cookies).toHaveLength(0);
  });

  test("accepts the very same sign-in from the trusted origin", async ({
    request,
  }) => {
    const response = await request.post(`${API_URL}/api/auth/sign-in/email`, {
      headers: { origin: CLIENT_ORIGIN },
      data: credentials,
    });

    expect(response.status()).toBe(200);
    expect(setCookieHeaders(response)).toHaveLength(1);
  });

  test("refuses a foreign origin even when the browser sends the session cookie", async ({
    request,
  }) => {
    // The real CSRF shape: the victim is already signed in, so their browser
    // attaches the session cookie to the attacker's cross-site request.
    const signedIn = await request.post(`${API_URL}/api/auth/sign-in/email`, {
      headers: { origin: CLIENT_ORIGIN },
      data: credentials,
    });
    expect(signedIn.status()).toBe(200);

    const response = await request.post(`${API_URL}/api/auth/sign-in/email`, {
      headers: { origin: FOREIGN_ORIGIN },
      data: credentials,
    });

    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({ code: "INVALID_ORIGIN" });
    expect(setCookieHeaders(response)).toHaveLength(0);
  });

  test("blocks a cross-site navigation sign-in under its own error code", async ({
    request,
  }) => {
    const response = await request.post(`${API_URL}/api/auth/sign-in/email`, {
      headers: {
        origin: FOREIGN_ORIGIN,
        "sec-fetch-site": "cross-site",
        "sec-fetch-mode": "navigate",
        "sec-fetch-dest": "document",
      },
      data: credentials,
    });

    expect(response.status()).toBe(403);
    // A separate code from INVALID_ORIGIN: this branch catches a form posted
    // by a cross-site *navigation*, which carries no Origin the gate can trust.
    expect(await response.json()).toMatchObject({
      code: "CROSS_SITE_NAVIGATION_LOGIN_BLOCKED",
    });
    expect(setCookieHeaders(response)).toHaveLength(0);
  });

  test("still signs in a client that sends no Origin at all", async ({
    request,
  }) => {
    // Pinning a real boundary of the gate: with no Origin, no cookie and no
    // Sec-Fetch metadata, there is nothing to check and the sign-in proceeds.
    // That is not a browser hole — a browser always labels a cross-site POST,
    // and each of those labels is refused by the tests above — but it does mean
    // the gate protects browsers, not non-browser clients.
    const response = await request.post(`${API_URL}/api/auth/sign-in/email`, {
      data: credentials,
    });

    expect(response.status()).toBe(200);
  });
});

test.describe("Sign out", () => {
  test("succeeds without a session instead of erroring", async ({
    request,
  }) => {
    const response = await request.post(`${API_URL}/api/auth/sign-out`, {
      headers: { origin: CLIENT_ORIGIN },
      data: {},
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ success: true });
  });
});

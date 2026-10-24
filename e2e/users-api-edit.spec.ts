import { test, expect } from "@playwright/test";
import {
  ADMIN,
  AGENT,
  API_URL,
  CLIENT_ORIGIN,
  signInViaApi,
} from "./support/auth";
import { ALLOWED_FIELDS, createUserViaApi, newUserEmail } from "./support/users";

// Split out of users-api.spec.ts rather than appended to it: that file covers
// who may read the roster and what a create refuses, and adding editing to it
// put one file past 300 lines of code with three verbs in it. The allow-list
// both files assert now lives in support/users.ts, so there is still one
// definition of it.

// PATCH takes the whole editable profile — name and email are required, only
// password is optional. That is what the form sends, because the form is
// prefilled with the row and therefore always has both. The verb is still
// PATCH rather than PUT because the resource has fields the body may not
// carry at all: `role` and `id` are not editable here and no body can set them.
test.describe("Users API — editing, refused", () => {
  test("PATCH /api/users/:id is 401 without a session", async ({ request }) => {
    const response = await request.patch(`${API_URL}/api/users/any-id`, {
      data: { name: "Nope", email: newUserEmail("unauthenticated") },
    });

    expect(response.status()).toBe(401);
  });

  test("PATCH /api/users/:id is 403 for an agent session", async ({
    request,
  }) => {
    await signInViaApi(request, AGENT);

    const response = await request.patch(`${API_URL}/api/users/any-id`, {
      data: { name: "Nope", email: newUserEmail("forbidden") },
    });

    expect(response.status()).toBe(403);
  });
});

test.describe("Users API — editing", () => {
  test("PATCH /api/users/:id updates the profile and answers the allow-list", async ({
    request,
  }) => {
    await signInViaApi(request, ADMIN);
    const created = await createUserViaApi(request, "patch-profile");
    const newEmail = newUserEmail("patch-profile-new");

    const response = await request.patch(`${API_URL}/api/users/${created.id}`, {
      data: { name: "Edited Name", email: newEmail },
    });

    expect(response.status()).toBe(200);
    const { user } = (await response.json()) as {
      user: Record<string, unknown>;
    };
    // The same key set GET and POST answer with — the allow-list reaches every
    // endpoint because all three import one constant.
    expect(Object.keys(user).sort()).toEqual(ALLOWED_FIELDS);
    expect(user.name).toBe("Edited Name");
    expect(user.email).toBe(newEmail);

    // And it is really stored, not just echoed back.
    const roster = await request.get(`${API_URL}/api/users`);
    const { users } = (await roster.json()) as { users: { email: string }[] };
    expect(users.map((u) => u.email)).toContain(newEmail);
    expect(users.map((u) => u.email)).not.toContain(created.email);
  });

  // The same correctness rule POST has: /sign-in/email looks a user up by
  // email.toLowerCase(), so an address stored with a capital belongs to an
  // account nobody can sign in to. An edit can introduce one just as easily as
  // a create can.
  test("PATCH /api/users/:id lowercases the address it stores", async ({
    request,
  }) => {
    await signInViaApi(request, ADMIN);
    const created = await createUserViaApi(request, "patch-case");
    const typedEmail = newUserEmail("patch-case-new").toUpperCase();

    const response = await request.patch(`${API_URL}/api/users/${created.id}`, {
      data: { name: "Edited Case", email: typedEmail },
    });

    expect(response.status()).toBe(200);
    const { user } = (await response.json()) as { user: { email: string } };
    expect(user.email).toBe(typedEmail.toLowerCase());

    // Signing in with the address as it was typed still works, which is the
    // whole point of storing the lowercase form.
    const signIn = await request.post(`${API_URL}/api/auth/sign-in/email`, {
      headers: { origin: CLIENT_ORIGIN },
      data: { email: typedEmail, password: created.password },
    });
    expect(signIn.status()).toBe(200);
  });

  // The feature's central rule, and the one thing no other layer can prove:
  // only a real sign-in can tell whether the stored hash still matches.
  test("PATCH /api/users/:id leaves the password alone when the body carries none", async ({
    request,
  }) => {
    await signInViaApi(request, ADMIN);
    const created = await createUserViaApi(request, "patch-no-password");

    const response = await request.patch(`${API_URL}/api/users/${created.id}`, {
      data: { name: "Renamed Only", email: created.email },
    });
    expect(response.status()).toBe(200);

    const signIn = await request.post(`${API_URL}/api/auth/sign-in/email`, {
      headers: { origin: CLIENT_ORIGIN },
      data: { email: created.email, password: created.password },
    });
    expect(signIn.status()).toBe(200);
  });

  test("PATCH /api/users/:id replaces the password when the body carries one", async ({
    request,
  }) => {
    await signInViaApi(request, ADMIN);
    const created = await createUserViaApi(request, "patch-password");
    const newPassword = "brandnew98765";

    const response = await request.patch(`${API_URL}/api/users/${created.id}`, {
      data: {
        name: "Renamed Too",
        email: created.email,
        password: newPassword,
      },
    });
    expect(response.status()).toBe(200);

    const withNew = await request.post(`${API_URL}/api/auth/sign-in/email`, {
      headers: { origin: CLIENT_ORIGIN },
      data: { email: created.email, password: newPassword },
    });
    expect(withNew.status()).toBe(200);

    // The old one must stop working, or the update wrote a second usable
    // credential instead of replacing the one that was there.
    const withOld = await request.post(`${API_URL}/api/auth/sign-in/email`, {
      headers: { origin: CLIENT_ORIGIN },
      data: { email: created.email, password: created.password },
    });
    expect(withOld.status()).toBe(401);
  });

  // Same guarantee POST gives: no endpoint reads a role from a body, so an
  // edit cannot promote anyone. zod strips the key, so this is ignored rather
  // than refused.
  test("PATCH /api/users/:id ignores a body asking for the admin role", async ({
    request,
  }) => {
    await signInViaApi(request, ADMIN);
    const created = await createUserViaApi(request, "patch-role");

    const response = await request.patch(`${API_URL}/api/users/${created.id}`, {
      data: { name: "Still Agent", email: created.email, role: "admin" },
    });

    expect(response.status()).toBe(200);
    const { user } = (await response.json()) as { user: { role: string } };
    expect(user.role).toBe("agent");
  });
});

test.describe("Users API — editing, rejected input", () => {
  test("PATCH /api/users/:id is 409 when the email belongs to someone else", async ({
    request,
  }) => {
    await signInViaApi(request, ADMIN);
    const created = await createUserViaApi(request, "patch-duplicate");

    const response = await request.patch(`${API_URL}/api/users/${created.id}`, {
      data: { name: "Clash", email: ADMIN.email },
    });

    expect(response.status()).toBe(409);
    expect(await response.json()).toEqual({ error: "email_taken" });
  });

  // The unique index compares bytes, so without the schema's .toLowerCase()
  // this would be stored as a second row holding the same address.
  test("PATCH /api/users/:id treats a differently-cased email as a duplicate", async ({
    request,
  }) => {
    await signInViaApi(request, ADMIN);
    const created = await createUserViaApi(request, "patch-duplicate-case");

    const response = await request.patch(`${API_URL}/api/users/${created.id}`, {
      data: { name: "Clash", email: ADMIN.email.toUpperCase() },
    });

    expect(response.status()).toBe(409);
    expect(await response.json()).toEqual({ error: "email_taken" });
  });

  test("PATCH /api/users/:id is 404 for an id that does not exist", async ({
    request,
  }) => {
    await signInViaApi(request, ADMIN);

    const response = await request.patch(
      `${API_URL}/api/users/${crypto.randomUUID()}`,
      { data: { name: "Ghost", email: newUserEmail("patch-missing") } },
    );

    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({ error: "user_not_found" });
  });

  // Blank means "leave it", but a short password means a short password. This
  // is what holds the transform-then-refine order in updateUserSchema
  // together: a .min(8) written in front of the transform would reject the
  // blank field instead, and this test would stay green while the feature
  // broke the other way.
  test("PATCH /api/users/:id is 400 when a password is shorter than 8", async ({
    request,
  }) => {
    await signInViaApi(request, ADMIN);
    const created = await createUserViaApi(request, "patch-short-password");

    const response = await request.patch(`${API_URL}/api/users/${created.id}`, {
      data: { name: "Short", email: created.email, password: "short77" },
    });

    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_body" });

    // And nothing was written: the old password still signs in.
    const signIn = await request.post(`${API_URL}/api/auth/sign-in/email`, {
      headers: { origin: CLIENT_ORIGIN },
      data: { email: created.email, password: created.password },
    });
    expect(signIn.status()).toBe(200);
  });

  test("PATCH /api/users/:id is 400 for a malformed email", async ({
    request,
  }) => {
    await signInViaApi(request, ADMIN);
    const created = await createUserViaApi(request, "patch-bad-email");

    const response = await request.patch(`${API_URL}/api/users/${created.id}`, {
      data: { name: "Bad", email: "not-an-email" },
    });

    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_body" });
  });
});

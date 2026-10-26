import { test, expect } from "@playwright/test";
import {
  ADMIN,
  AGENT,
  API_URL,
  CLIENT_ORIGIN,
  signInViaApi,
} from "./support/auth";
import {
  ALLOWED_FIELDS,
  createUserViaApi,
  NEW_USER_PASSWORD,
  newUserEmail,
} from "./support/users";

// Its own file for the same reason editing got one: a third verb in
// users-api.spec.ts would put it back past 300 lines of code.
//
// The delete is soft. The row survives with `deletedAt` stamped, the roster
// goes on listing it, and the address it holds stays taken — all three are
// decisions, and each one has a spec below, because every one of them reads
// like an oversight to anyone who has not been told.

test.describe("Users API — deleting, refused", () => {
  test("DELETE /api/users/:id is 401 without a session", async ({
    request,
  }) => {
    const response = await request.delete(`${API_URL}/api/users/any-id`);

    expect(response.status()).toBe(401);
  });

  test("DELETE /api/users/:id is 403 for an agent session", async ({
    request,
  }) => {
    await signInViaApi(request, AGENT);

    const response = await request.delete(`${API_URL}/api/users/any-id`);

    expect(response.status()).toBe(403);
  });
});

test.describe("Users API — deleting", () => {
  test("DELETE /api/users/:id soft-deletes and answers the allow-list", async ({
    request,
  }) => {
    await signInViaApi(request, ADMIN);
    const created = await createUserViaApi(request, "delete-shape");

    const response = await request.delete(`${API_URL}/api/users/${created.id}`);

    expect(response.status()).toBe(200);
    const { user } = (await response.json()) as {
      user: Record<string, unknown>;
    };
    // The same key set every other /api/users answer carries — all four verbs
    // import one constant, and this is the check that notices if one of them
    // starts writing its own `select`.
    expect(Object.keys(user).sort()).toEqual(ALLOWED_FIELDS);
    expect(user.deletedAt).not.toBeNull();
  });

  // The decision the whole feature rests on: deleted rows are *shown*, muted
  // and badged, rather than filtered out. Add a `where` to the roster's
  // findMany and this is the only thing that notices.
  test("GET /api/users still lists a deleted user, with deletedAt set", async ({
    request,
  }) => {
    await signInViaApi(request, ADMIN);
    const created = await createUserViaApi(request, "delete-still-listed");
    await request.delete(`${API_URL}/api/users/${created.id}`);

    const roster = await request.get(`${API_URL}/api/users`);
    const { users } = (await roster.json()) as {
      users: { email: string; deletedAt: string | null }[];
    };

    // By address, never by index or count — five workers share this database.
    const row = users.find((u) => u.email === created.email);
    expect(row, "the deleted user should still be in the roster").toBeDefined();
    expect(row?.deletedAt).not.toBeNull();
  });

  // Requirement 4's server half, and nothing above the API can prove it: only a
  // real cookie against a real session table can say whether the person is
  // still signed in.
  test("deleting a user stops the cookie they are already holding", async ({
    request,
    playwright,
  }) => {
    await signInViaApi(request, ADMIN);
    const created = await createUserViaApi(request, "delete-kills-session");

    // A context of its own so it carries only this user's cookie.
    const theirs = await playwright.request.newContext();
    try {
      const signIn = await theirs.post(`${API_URL}/api/auth/sign-in/email`, {
        headers: { origin: CLIENT_ORIGIN },
        data: { email: created.email, password: created.password },
      });
      expect(signIn.status()).toBe(200);

      // Control: the cookie works before the delete, so the 401 below cannot be
      // blamed on the way this context is built.
      expect((await theirs.get(`${API_URL}/api/me`)).status()).toBe(200);

      await request.delete(`${API_URL}/api/users/${created.id}`);

      expect((await theirs.get(`${API_URL}/api/me`)).status()).toBe(401);
    } finally {
      await theirs.dispose();
    }
  });

  test("DELETE /api/users/:id is 403 for an admin", async ({ request }) => {
    await signInViaApi(request, ADMIN);
    const roster = await request.get(`${API_URL}/api/users`);
    const { users } = (await roster.json()) as {
      users: { id: string; email: string }[];
    };
    // By address, because position says nothing in a shared database.
    const admin = users.find((u) => u.email === ADMIN.email);

    const response = await request.delete(`${API_URL}/api/users/${admin?.id}`);

    expect(response.status()).toBe(403);
    // Not `forbidden`: the caller is entitled, the target is protected.
    expect(await response.json()).toEqual({ error: "admin_not_deletable" });
  });

  // DELETE is idempotent, and the row keeps the timestamp of the deletion that
  // actually happened rather than the one that changed nothing.
  test("DELETE /api/users/:id twice keeps the first timestamp", async ({
    request,
  }) => {
    await signInViaApi(request, ADMIN);
    const created = await createUserViaApi(request, "delete-twice");

    const first = await request.delete(`${API_URL}/api/users/${created.id}`);
    const second = await request.delete(`${API_URL}/api/users/${created.id}`);

    expect(first.status()).toBe(200);
    expect(second.status()).toBe(200);
    const firstBody = (await first.json()) as { user: { deletedAt: string } };
    const secondBody = (await second.json()) as { user: { deletedAt: string } };
    expect(secondBody.user.deletedAt).toBe(firstBody.user.deletedAt);
  });

  test("DELETE /api/users/:id is 404 for an id that does not exist", async ({
    request,
  }) => {
    await signInViaApi(request, ADMIN);

    const response = await request.delete(
      `${API_URL}/api/users/${crypto.randomUUID()}`,
    );

    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({ error: "user_not_found" });
  });
});

test.describe("Users API — what a deleted user can no longer do", () => {
  // The roster still shows them, so "not found" is worth pinning as the
  // deliberate answer: visible is not the same as editable.
  test("PATCH /api/users/:id is 404 once the user is deleted", async ({
    request,
  }) => {
    await signInViaApi(request, ADMIN);
    const created = await createUserViaApi(request, "delete-then-patch");
    await request.delete(`${API_URL}/api/users/${created.id}`);

    const response = await request.patch(`${API_URL}/api/users/${created.id}`, {
      data: { name: "Renamed After Delete", email: created.email },
    });

    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({ error: "user_not_found" });
  });

  // The layer the course reference is missing. Without it a deleted user just
  // signs in again and the session wipe above buys nothing.
  //
  // Asserting the two bodies are *equal* rather than asserting a status is the
  // point: a refusal that said "this account was deleted" would let anyone with
  // an address learn whether it had ever been one of ours.
  test("a deleted user cannot sign in again, and cannot tell why", async ({
    request,
    playwright,
  }) => {
    await signInViaApi(request, ADMIN);
    const created = await createUserViaApi(request, "delete-blocks-signin");
    await request.delete(`${API_URL}/api/users/${created.id}`);

    // Its own context: signing in here must not replace the admin cookie the
    // shared one is holding.
    const anonymous = await playwright.request.newContext();
    try {
      const deleted = await anonymous.post(
        `${API_URL}/api/auth/sign-in/email`,
        {
          headers: { origin: CLIENT_ORIGIN },
          // The real password. It still verifies — the credential row survives
          // a soft delete — so only the refusal above can be what stops this.
          data: { email: created.email, password: created.password },
        },
      );
      const neverExisted = await anonymous.post(
        `${API_URL}/api/auth/sign-in/email`,
        {
          headers: { origin: CLIENT_ORIGIN },
          data: {
            email: newUserEmail("delete-never-existed"),
            password: created.password,
          },
        },
      );

      expect(deleted.status()).toBe(401);
      expect(deleted.status()).toBe(neverExisted.status());
      expect(await deleted.json()).toEqual(await neverExisted.json());
    } finally {
      await anonymous.dispose();
    }
  });

  // The address stays occupied, because `@@unique([email])` was deliberately
  // left whole rather than made partial. Make it partial and this goes red.
  test("the address of a deleted user is still taken", async ({ request }) => {
    await signInViaApi(request, ADMIN);
    const created = await createUserViaApi(request, "delete-keeps-email");
    await request.delete(`${API_URL}/api/users/${created.id}`);

    const response = await request.post(`${API_URL}/api/users`, {
      data: {
        name: "Someone Else",
        email: created.email,
        password: NEW_USER_PASSWORD,
      },
    });

    expect(response.status()).toBe(409);
    expect(await response.json()).toEqual({ error: "email_taken" });

    // And a different address is still free, so the 409 above is about this
    // one row rather than creates being broken.
    const other = await request.post(`${API_URL}/api/users`, {
      data: {
        name: "Someone Else",
        email: newUserEmail("delete-keeps-email-control"),
        password: NEW_USER_PASSWORD,
      },
    });
    expect(other.status()).toBe(201);
  });
});

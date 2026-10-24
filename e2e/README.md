# E2E tests

Playwright specs live here as `*.spec.ts`. Config: [`../playwright.config.ts`](../playwright.config.ts).

Current specs:

- `login.spec.ts` — sign-in happy path, inline form validation, rejected
  credentials (error dialog), the password show/hide toggle
- `route-protection.spec.ts` — signed-out redirects, admin-only `/users`,
  an agent being sent home, and the role-gated nav link
- `session.spec.ts` — session survives a reload; log out really ends it, including
  against the Back button
- `auth-api.spec.ts` — `GET /api/me` (401 / 200), public sign-up being refused,
  and how the API treats odd email spellings
- `security.spec.ts` — the session cookie is httpOnly and signature-checked, plus the
  two origin gates side by side: CORS answers a foreign origin without granting it
  read permission, while `trustedOrigins` refuses it outright with 403
- `users-api.spec.ts` — `/api/users` without a browser: who may read the roster and
  who may create, the field allow-list on both answers, and what a create refuses
  (duplicate address, short password, malformed email)
- `users-api-edit.spec.ts` — `PATCH /api/users/:id` without a browser: who may edit,
  the allow-list it answers with, what a password-less body leaves alone, and what an
  edit refuses. Split out of `users-api.spec.ts` because one file covering three verbs
  went past 300 lines of code
- `create-user.spec.ts` — the admin creates an agent through the dialog, the row
  appears without a reload, a taken address reports inline, and the new account can
  really sign in
- `edit-user.spec.ts` — the pencil opens the dialog for the row it sits in, a rename
  reaches the table without a reload, Save waits for a real change, and a taken address
  reports inline in the dialog that stays open

The `trustedOrigins` tests only work because `server/src/auth.ts` sets
`advanced: { disableOriginCheck: false }`. Better Auth otherwise defaults that check
off when `NODE_ENV=test` — exactly what the E2E run sets — which would leave the gate
silently absent and untestable. Don't remove that line.

`support/auth.ts` holds the seeded credentials and the shared login locators;
`support/users.ts` names a row a spec is about to create (`newUserEmail`), creates one
over HTTP (`createUserViaApi`), and holds `ALLOWED_FIELDS`, the key set both
`users-api.spec.ts` and `users-api-edit.spec.ts` assert on. Neither is a
spec, so Playwright does not collect them.

`global-setup.ts` migrates, truncates, then re-seeds `ticket_management_test` before
every run. Without it each sign-in left a session row behind for good, and anything
that counted rows would have passed or failed based on how often the suite had been
run before.

**A spec may assume the two seeded accounts exist — not that they are the only ones.**
That changed when create-user landed: the run is `fullyParallel` across five workers
against this one database, truncation happens once per run rather than per spec, so
any row another worker creates is visible here. Two rules follow, and both are load
bearing:

1. Name every row you create with `newUserEmail()` from `support/users.ts`. It uses a
   UUID, not a timestamp, because five workers can start inside the same millisecond.
2. Never assert a roster length, a row count or an ordering. Assert that the rows you
   care about are present — `users-api.spec.ts` uses `expect.arrayContaining` and a
   per-row key-set loop for exactly this reason.

## Running

```bash
npm run test:e2e        # headless
npm run test:e2e:ui     # Playwright UI mode
```

Playwright starts the API (port 3001, `server/.env.test`) and the SPA (port 5174,
`client/.env.test`) itself, so no dev server needs to be running. Both point at the
`ticket_management_test` database, never at the dev one.

The only prerequisite is **PostgreSQL running** with a `ticket_management_test` database
that exists (`createdb ticket_management_test`). Migrating, wiping and seeding all happen
per run, and `pretest:e2e` installs the Chromium build Playwright needs, so a fresh clone
needs nothing beyond `npm install`.

If `DATABASE_URL` is exported in your shell, the run refuses to start rather than use it —
`--env-file` cannot overwrite an existing variable, so an ambient value would otherwise
point the whole suite at that database. Unset it.

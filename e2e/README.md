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
- `users-api-delete.spec.ts` — `DELETE /api/users/:id` without a browser: who may
  delete, the allow-list, the row surviving with `deletedAt` set, the wiped sessions,
  the refused re-sign-in, the protected admin, and the idempotent re-delete
- `delete-user.spec.ts` — the trash can asks first: confirming badges the row without a
  reload, cancelling leaves it alone, and a deleted user's own open session stops working
- `session-expiry.spec.ts` — the 401 interceptor in `client/src/lib/api.ts`, wired up: an
  admin's session is cleared out from under a loaded `/users`, and the next click that
  reaches the API lands them on `/login`. Deliberately no `reload()` — that path goes
  through `ProtectedRoute` and `delete-user.spec.ts` already covers it. It has to be an
  admin: every axios call in the client targets the admin-only `/api/users`, so an
  agent's clicks only ever produce a 403, which the interceptor must leave alone
- `webhook-inbound-email.spec.ts` — `POST /api/webhooks/inbound-email`, the one route
  in the app that is **not** called by a person: who may post mail (the shared secret in
  a header, and a 401 when it is only in the query string), what a malformed email is
  refused for, the field set of the ticket it creates together with the three fields a
  body cannot set, and the duplicate guard — a `Re:`/`Fwd:`/stacked-prefix follow-up
  answers 200 with the ticket that already exists, while the same subject sent twice
  *without* a reply prefix is two tickets, while a wildcard one (`Re: %`) cannot reach
  anyone else's ticket. Two of them exist only to reach parts of the guard nothing
  touched: a wrong secret of **exactly the same length** (without it the byte comparison
  never ran in the whole suite, so a guard that accepted any same-length secret stayed
  green) and a doubled header. The only specs here that never sign in

The `trustedOrigins` tests only work because `server/src/auth.ts` sets
`advanced: { disableOriginCheck: false }`. Better Auth otherwise defaults that check
off when `NODE_ENV=test` — exactly what the E2E run sets — which would leave the gate
silently absent and untestable. Don't remove that line.

`support/auth.ts` holds the seeded credentials and the shared login locators;
`support/users.ts` names a row a spec is about to create (`newUserEmail`), creates one
over HTTP (`createUserViaApi`), and holds `ALLOWED_FIELDS`, the key set both
`users-api.spec.ts` and `users-api-edit.spec.ts` assert on. Neither is a
spec, so Playwright does not collect them.

`support/inbound-email.ts` does the same job for the webhook: `postInboundEmail` posts
one email (with the secret, with a wrong one, or with none), `validEmail` builds a
complete body to spread and override, `newSubject`/`newSenderEmail` make both halves of
the duplicate guard's match unique per spec, and `ALLOWED_TICKET_FIELDS` is the key set
every answer is checked against. It **spells the test secret out** rather than importing
what the server reads — same reason `ALLOWED_FIELDS` is hand-written: a spec that reads
the value under test can never notice that value being wrong.

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
3. Prove identity by comparing ids, never by counting. The webhook specs are the ones
   that forced this: "the follow-up joined the ticket I just made" is
   `second.id === first.id`, and "these are two tickets" is `not.toBe`. Both survive
   another worker inserting rows mid-test; `expect(tickets).toHaveLength(2)` would not.

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

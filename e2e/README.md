# E2E tests

Playwright specs live here as `*.spec.ts`. Config: [`../playwright.config.ts`](../playwright.config.ts).

Current specs (authentication):

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

The `trustedOrigins` tests only work because `server/src/auth.ts` sets
`advanced: { disableOriginCheck: false }`. Better Auth otherwise defaults that check
off when `NODE_ENV=test` — exactly what the E2E run sets — which would leave the gate
silently absent and untestable. Don't remove that line.

`support/auth.ts` holds the seeded credentials and the shared login locators
(it is not a spec, so Playwright does not collect it).

`global-setup.ts` migrates, truncates, then re-seeds `ticket_management_test` before
every run, so a spec may assume exactly the two seeded accounts and nothing else.
Without it each sign-in left a session row behind for good, and anything that counted
rows would have passed or failed based on how often the suite had been run before.

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

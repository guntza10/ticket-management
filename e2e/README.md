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

## Running

```bash
npm run test:e2e        # headless
npm run test:e2e:ui     # Playwright UI mode
```

Playwright starts the API (port 3001, `server/.env.test`) and the SPA (port 5174,
`client/.env.test`) itself, so no dev server needs to be running. Both point at the
`ticket_management_test` database, never at the dev one.

Prerequisites: PostgreSQL running, and the test DB prepared once with

```bash
npm run db:migrate:test --workspace server
npm run db:seed:test --workspace server
```

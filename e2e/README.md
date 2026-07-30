# E2E tests

Playwright specs live here as `*.spec.ts`. Config: [`../playwright.config.ts`](../playwright.config.ts).

Nothing is written yet — the setup exists first, tests come next.

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

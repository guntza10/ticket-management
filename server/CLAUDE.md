# Server (Express API)

Express 5 + TypeScript API on Node 24. Shared, monorepo-level rules live in
[`../CLAUDE.md`](../CLAUDE.md).

## Stack

- **Express 5** + **TypeScript**, run by **Node 24 natively** (type stripping — no build)
- **Prisma 7** + `@prisma/adapter-pg` → **PostgreSQL**
- **better-auth** (email/password, DB-backed sessions)

## Commands

- `npm run dev:server` — `node --watch` → http://localhost:3000
- `npm run typecheck:server` — `tsc --noEmit`
- `npm run db:generate | db:migrate | db:studio | db:seed --workspace server`
- Test-DB variants: `start:test`, `db:migrate:test`, `db:seed:test`, `db:reset:test`

## Runtime & TypeScript

- Node 24 runs `.ts` directly — **do not add `tsx` or a build step.** Dev uses `node --watch`.
- `tsconfig.json` is type-check-only (Node ignores it at runtime); `erasableSyntaxOnly`
  is on → **no enums / parameter-properties / decorators** in server code.
- **Clean TypeScript is enforced:** `strict` + `noUncheckedIndexedAccess` (tsconfig), and
  oxlint runs `correctness`/`suspicious`/`perf` as errors plus `typescript/no-explicit-any`.
  A repo `PostToolUse` hook (`.claude/hooks/ts-check.sh`) lint/typechecks every `.ts` edit.
  Run `npm run lint --workspace server` alongside `typecheck`.

## Auth (better-auth)

- Config in `src/auth.ts`; handler mounted at `/api/auth/*` in `src/index.ts`
  **before `express.json()`** (it reads the raw body — JSON parsing above it hangs calls).
- **CORS** (`cors` middleware: origin `http://localhost:5173`, `credentials: true`) **and**
  **`trustedOrigins`** are both required for the cross-origin SPA — CORS is the browser
  gate, `trustedOrigins` is better-auth's CSRF gate. They are separate.
- `disableSignUp: true` — internal portal, no public registration.
- **`role`** is a Prisma enum (`agent`/`admin`) exposed via `additionalFields` with
  `input: false` (clients can't set their own role; seeding/admin assigns it).
- Seed an admin with `npm run db:seed --workspace server` (reads `ADMIN_EMAIL` /
  `ADMIN_PASSWORD` from `.env`).

## Database

- PostgreSQL on **localhost:5432**, DB `ticket_management`; `DATABASE_URL` in `.env`.
- Start your local Postgres before running the server or any `db:*` script.
- **Test DB:** `ticket_management_test` on the same server, configured by `.env.test`
  (gitignored; `.env.test.example` is committed). Only the Playwright run touches it.
  - `start:test` / `db:seed:test` use `node --env-file=.env.test`.
  - The `prisma` CLI can't take `--env-file`, so the `db:*:test` scripts set
    `DOTENV_CONFIG_PATH=.env.test` — `prisma.config.ts` does `import "dotenv/config"`,
    which reads that variable to pick the file.

## Environment-driven config

`src/config.ts` holds the three values that differ between the dev run and the E2E run —
`PORT`, `CLIENT_ORIGIN` (used by **both** CORS and `trustedOrigins`, so they can't
drift), and `RATE_LIMIT_ENABLED`. Don't hardcode ports or origins in `index.ts`/`auth.ts`.

**Rate limiting:** Better Auth's built-in limiter is enabled only when
`NODE_ENV=production` (default: 100 requests / 60s, stricter on sign-in). Keep it on in
production; `.env.test` sets `NODE_ENV=test` so E2E runs don't hit 429s.

## Gotchas

- **Don't re-run `better-auth generate`** — it rewrites the `role` field back to String.
- After a schema change, if the client errors "Unknown argument X", run
  `npm run db:generate --workspace server` (migrate doesn't always regenerate the client).

## Structure

- `src/index.ts` — Express app + routes
- `src/auth.ts` — better-auth config · `src/require-auth.ts` — session guard
- `src/db.ts` — Prisma client · `prisma/` — schema, migrations, `seed.ts`

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
- Test-DB variants: `start:test`, `db:migrate:test`, `db:seed:test`, `db:truncate:test`,
  `db:reset:test`

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

## Module layout

- **An API resource is a folder, not a layer.** Everything about `/api/users` — its
  router and the logic behind it — lives in `src/users/`. The alternative (a `routes/`
  folder beside a `services/` folder) scatters one feature across several directories,
  which is felt the moment a change touches more than the route. Tickets and categories
  follow the same shape.
- **`index.ts` holds wiring, not routes:** middleware order, mounts, the error handler,
  `listen`. The only handlers left in it are `/api/me`, `/` and `/health` — `/api/me`
  moves the day auth gets a module of its own.
- **The path prefix lives at the mount**, so `app.use("/api/users", usersRouter)` pairs
  with `router.get("/")`. A rename then touches one line instead of every route.
- **Guards go on the router when the whole resource shares them.** `users.routes.ts`
  calls `router.use(requireAuth, requireAdmin)` once rather than repeating the pair on
  each route: every route under `/api/users` is admin-only, and the mistake that ships
  is a new route added without the guards, not one that needed to opt out. Put them on
  the individual route only when they genuinely differ between routes.

## Authorization

- Two separate guards, mounted in that order: `requireAuth` (is there a session? no → **401**)
  then `requireAdmin` (is the role `admin`? no → **403**). Authentication and authorization
  are different questions, so they get different middleware and different status codes —
  401 tells a client to sign in, which would never fix an agent hitting an admin route.
- `requireAdmin` reads `res.locals.session` and therefore **only works mounted after
  `requireAuth`**. `require-auth.ts` augments `Express.Locals` so that session is typed
  (without it every `res.locals.session` is `any`).
- **Endpoints returning user data always `select` an allow-list of fields.** A bare
  `findMany()` ships every column the table happens to have, including whatever the next
  migration adds.

## Error handling

- **One error-handling middleware, last in `index.ts`** — four parameters
  (`err, req, res, next`); three and Express silently treats it as ordinary
  middleware that never runs.
- **Routes don't `try/catch` just to produce a 500.** Express 5 forwards a rejected
  promise from an `async` handler to that middleware on its own. Catch only when the
  error should *change the response* (Prisma `P2002` → 409) — and `throw err` for
  anything unrecognised, or you swallow errors you never meant to handle.
- **Why bother, when Express already has a default handler:** the default is safe
  (it hides the stack once `NODE_ENV=production`) but replies in **HTML**. Ours keeps
  every error in the API one shape — JSON `{ error: "…" }`, same as 401/403 — and
  doesn't depend on an env var being set right. It's also where error→status mapping
  will live as the API grows.

## Database

- PostgreSQL on **localhost:5433**, DB `ticket_management`; `DATABASE_URL` in `.env`.
- Start your local Postgres before running the server or any `db:*` script.
- **Test DB:** `ticket_management_test` on the same server, configured by `.env.test`
  (gitignored; `.env.test.example` is committed). Only the Playwright run touches it.
  - `start:test` / `db:seed:test` use `node --env-file=.env.test`.
  - `db:truncate:test` empties every table (the Playwright `globalSetup` calls it before
    each run). It **refuses any database not named `*_test`** — the only thing separating
    it from the dev data is which env file loaded, so the guard is not optional.
    `db:reset:test` is the heavier hammer: it drops and re-applies migrations, for when
    the schema itself is wrong.
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

- `src/index.ts` — Express app wiring: middleware, mounts, error handler, `listen`
- `src/users/users.routes.ts` — the `/api/users` router
- `src/auth.ts` — better-auth config · `src/require-auth.ts` — session guard
  · `src/require-admin.ts` — role guard
- `src/db.ts` — Prisma client · `prisma/` — schema, migrations, `seed.ts`

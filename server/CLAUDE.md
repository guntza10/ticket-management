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
- **Imports only ever point downward, and right now nothing but this bullet says so.**
  `index.ts` may import a module; a module (`users/`) may import the shared files at
  `src/` root (`db.ts`, `auth.ts`, `require-*.ts`) and `core/`; those shared files may
  import neither a module nor `index.ts`, and **one module may not import another** —
  anything two modules need moves down to `src/` root or `core/`. Every import in
  `src/` already obeys all three; the point of writing it down is the day `tickets/`
  arrives and reaching into `users/create-user.ts` looks like the shortest path.
  The client enforces the same three with oxlint (**Where a new file goes** in
  [`../client/CLAUDE.md`](../client/CLAUDE.md)); this side cannot yet, because oxlint
  has no `import/no-restricted-paths` and the server's imports are all relative, so a
  glob cannot tell a sideways `../tickets/create-ticket.ts` from a legitimate
  `../generated/prisma/client.ts` — and with one module there is no second name to
  forbid. Two of the three zones *are* expressible today (shared root must not import
  `./*/**`; a module must not import `../index.ts`); whether to spell those now, wait
  for `tickets/`, or give the server a path alias via Node's `imports` field is an open
  decision — ask before picking one.
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
  migration adds. That list is **one exported constant** — `PUBLIC_USER_FIELDS` in
  `users/create-user.ts` — which `GET` and `POST /api/users` both import, so a column
  added to it reaches every answer at once. `PATCH` and `DELETE` should import it too
  rather than writing a `select` of their own; the two that existed were hand-kept
  copies until 2026-10-22, with a comment claiming they were shared. A plain object is
  enough, no `as const` or `satisfies`: Prisma still narrows the result type from it,
  so reading a field that was not selected is a type error.
  `e2e/users-api.spec.ts` asserts the exact key set on every row of both answers, which
  is the check that survives someone reintroducing a second copy.

## Creating accounts

- **`src/users/create-user.ts` owns the rows, and `prisma/seed.ts` calls it too.**
  An account is a `user` row *plus* a credential `account` row, and the two have to
  agree on
  `providerId: "credential"`, on `accountId` being the user's own id, and on the hasher.
  **That provider id is an exported const, `CREDENTIAL_PROVIDER_ID`**, since
  2026-10-23: it was a literal while this file was its only writer, but `update-user.ts`
  now *reads* account rows by it, and a reader and a writer disagreeing on that string
  does not throw — the filter matches nothing, `updateMany` answers `count: 0`, and a
  perfectly healthy row answers 500.
  Get any of those wrong and the account is created successfully and can simply never
  sign in — a failure with no error attached. One function means the seed and the
  endpoint cannot drift into that quietly.
- **Hash through `await auth.$context` → `ctx.password.hash`**, not the exported
  `hashPassword` from `better-auth/crypto`. They are the same function today, but
  sign-in verifies with whatever `emailAndPassword.password.hash` resolves to, so the
  config-aware one is the only one that stays correct if that is ever customised.
- **The email is lowercased by the schema, and that is correctness.** `/sign-in/email`
  looks a user up by `email.toLowerCase()`, and `@@unique([email])` compares bytes — so
  an address stored with a capital belongs to an account nobody can sign in to, sitting
  beside the lowercase one instead of being rejected as a duplicate.
- **Both rows go in one `$transaction`.** A user row whose account row never landed
  occupies the address, cannot sign in, and cannot be created again, because the retry
  answers 409 forever.
- **`role` is never read from the request body.** It is a literal in the handler. zod
  strips keys it doesn't know, so a body asking for `role: "admin"` is ignored rather
  than refused — `e2e/users-api.spec.ts` pins that the answer comes back as `agent`.
- **Duplicate address: catch Prisma `P2002`, don't pre-check.** A `findUnique` first is
  not race-proof, so it buys a round-trip and no correctness — and it makes the catch
  look unreachable, which is how the catch ends up untested and then wrong.
- **The validation schema lives in `core/schemas/users.ts`, shared with the client.**
  `users.routes.ts` and `prisma/seed.ts` both import it, and so does
  `client/src/features/users/components/CreateUserForm.tsx` — one definition,
  three readers.
  It was duplicated until 2026-10-22 on the belief that sharing was impossible here.
  That was half right: Node refuses to strip types **under `node_modules`**, which is
  exactly where npm symlinks a *workspace package* — but `core/` is a plain folder
  imported by relative path, so the restriction never applies. See the root
  `CLAUDE.md` → **Shared code (`core/`)** for the wiring that keeps it honest.

## Editing accounts

- **`PATCH /api/users/:id` takes the whole editable profile.** `name` and `email` are
  required, `password` is the only optional field. That is what the form sends, because
  the form is prefilled with the row and therefore always has both. The verb is still
  `PATCH` rather than `PUT` because the body never describes the whole resource: `role`
  and `id` are not editable here and no body can set them.
- **A blank password means "leave it alone", and that has to travel as an absent
  field.** `updateUserSchema` turns `""` into `undefined`, which `JSON.stringify` then
  drops, so the body carries no `password` key at all. The reason is hashing: the server
  hashes whatever it is given and a second hash of the same string is a different hash,
  so "no change" cannot be expressed as "the same value sent again". A body carrying
  `password: ""` would be a request to change the password *to* the empty string.
  - The order inside that schema is load-bearing: `.transform()` first, then `.refine()`
    for the 8-character rule. A `.min(8)` written in front of the transform sees the raw
    `""` and rejects the blank field — the exact opposite of the intent.
    `users-api-edit.spec.ts` pins both halves: a blank body succeeds and leaves the old
    password working, a 7-character one is a 400.
- **`src/users/update-user.ts` owns the write**, and it is not a mirror of
  `create-user.ts`: the two rows are not written together, because the profile always
  changes and the password usually does not. The hash is computed **outside** the
  transaction — Argon2 is deliberately slow and nothing in the transaction depends on
  it, so hashing inside would hold a connection and the row's lock open for no reason.
- **The credential row is updated with `updateMany`, and the count is checked.**
  `account` has no unique index on `(userId, providerId)`, so `update` cannot find the
  row by that pair. `updateMany` then answers `0` instead of throwing when nothing
  matched — so without the `count === 0` throw, a user with no credential account would
  get a `200` saying the password was changed when nothing was written. Throwing rolls
  the profile update back too, which is right: the caller asked for one change.
- **Missing row: catch Prisma `P2025`, don't pre-check** — same reasoning as `P2002` for
  a duplicate address. `user.update`'s `where` is the only one in the transaction, so
  `P2025` cannot mean anything else there.
- **Changing a password does not end that user's sessions.** Better Auth's sessions are
  rows keyed by token, not by the password hash, so someone already signed in stays
  signed in. Deliberate for now — see the Known gaps table in the root `CLAUDE.md`.

## Error handling

- **Every error answers `{ error: "<snake_case_code>" }`.** In use: `unauthenticated`
  (401), `forbidden` (403), `invalid_body` (400), `user_not_found` (404),
  `email_taken` (409), `internal_error` (500). A client reads the code; the prose for
  a person is the client's job.
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

- **oxlint's `no-async-endpoint-handlers` is off** (`.oxlintrc.json`). It was written for
  Express 4, which dropped a rejected promise on the floor; Express 5 forwards it to the
  error handler, which is what this codebase relies on. It was never protecting anything
  here either — it skips a handler whose request parameter is named `_req`, which is the
  only reason the pre-existing async `GET /api/users` passed it.
- **Don't re-run `better-auth generate`** — it rewrites the `role` field back to String.
- After a schema change, if the client errors "Unknown argument X", run
  `npm run db:generate --workspace server` (migrate doesn't always regenerate the client).

## Structure

- `src/index.ts` — Express app wiring: middleware, mounts, error handler, `listen`
- `src/users/` — the `/api/users` module: `users.routes.ts` (the router),
  `create-user.ts` (the field allow-list + the row-writing function shared with
  `prisma/seed.ts`) and `update-user.ts` (the profile/password write behind `PATCH`)
- `src/auth.ts` — better-auth config · `src/require-auth.ts` — session guard
  · `src/require-admin.ts` — role guard
- `src/db.ts` — Prisma client · `prisma/` — schema, migrations, `seed.ts`

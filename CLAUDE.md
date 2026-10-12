# Ticket Management

An internal **help-desk / support-ticket** app: agents log in to triage, answer, and
resolve tickets; admins additionally manage agent accounts and roles. Monorepo via
**npm workspaces** (`client` + `server`), built phase-by-phase per
`_resources/project/implementation-plan.md`.

**Per-workspace conventions live in [`client/CLAUDE.md`](client/CLAUDE.md) and
[`server/CLAUDE.md`](server/CLAUDE.md).** This file holds the shared, monorepo-level rules.

## Domain

- **Roles:** `admin` (manage users + everything an agent can do) · `agent` (work tickets).
- **Core entities:** User, Ticket (status `open`/`resolved`/`closed`, a category, an assigned agent), Category.
- **Later phases:** a knowledge base and AI features (auto-classify category, summarize a ticket, suggest a reply — agent reviews before sending).

## Tech stack

| Layer | Stack |
| --- | --- |
| Client | React 19, TypeScript, Vite 8, Tailwind v4, React Router 8 (declarative), react-hook-form + zod, shadcn/ui, axios + TanStack Query, better-auth client |
| Server | Express 5, Node 24 (native TS), Prisma 7 + PostgreSQL, better-auth |
| E2E | Playwright (repo root: `playwright.config.ts` + `e2e/`) |
| Tooling | npm workspaces, oxlint (client), Vitest + React Testing Library (client) |

## Prerequisites

- Node.js **24+** — the server runs TypeScript natively (type stripping), no build step
- npm 10+
- PostgreSQL on **localhost:5433** (DB `ticket_management`) — see `server/CLAUDE.md`

## Commands

Run from the repo root:

- `npm install` — install all workspaces
- `npm run dev:server` — Express API → http://localhost:3000
- `npm run dev:client` — Vite dev server → http://localhost:5173
- `npm run build:client` — type-check + build the client
- `npm run typecheck:server` — type-check the server
- `npm run lint --workspace client` — lint the client (oxlint)
- `npm run test:client` — Vitest component tests (add `-- --watch` to iterate)
- `npm run test:e2e` / `test:e2e:ui` — Playwright (starts its own servers; see **Testing**)
- `npm run lint:e2e` / `typecheck:e2e` — gates for `playwright.config.ts` + `e2e/`

Ports: server **3000**, client **5173**. The client calls the server cross-origin; the
server enables CORS (client origin + credentials). Details in the workspace files.

## Structure

- `client/` — React SPA (see `client/CLAUDE.md`)
- `server/` — Express API (see `server/CLAUDE.md`)
- `e2e/` — Playwright specs (`*.spec.ts`); config is `playwright.config.ts` at the root
- `_resources/` — planning docs (implementation plan, requirements, knowledge notes)

## Conventions (shared)

- **Package manager:** npm workspaces (bun is not installed on this machine).
- **Versions:** intentionally on the latest (Vite 8 / TS 6). Pinning to the course reference (Vite 7 / TS 5) is an open decision — ask before changing.
- **Skills:** vendored as real files under `.claude/skills/` (committed). `.agents/` is gitignored; `skills-lock.json` is the source of truth.
- **Secrets:** never commit. Use `.env` (gitignored) + `.env.example`, and expand env vars in configs (e.g. `.mcp.json`).
- **Clean TypeScript is enforced** on every `.ts`/`.tsx` edit by a `PostToolUse` hook (`.claude/hooks/ts-check.sh`) that runs oxlint + `tsc` for the touched workspace and reports failures back. Rule sets live in the workspace files. This is the **objective** layer (deterministic, hard gate).
- **Subjective clean-code** (naming, single-responsibility, abstraction, readability) — what the linter can't judge — is reviewed by the **`clean-code-reviewer` subagent**. Invoke it after writing a meaningful chunk of TS (a component / module / feature) or before a commit — **not** on every edit (a per-edit LLM review is slow and can loop). It's read-only; apply its findings yourself.
- **Reusable setup kit:** generalizable governance/config (the clean-TS hook, reviewer agents, lint/tsconfig) is captured in `~/Desktop/Practice/_setup-kit/`. When a new reusable piece is built here — e.g. the **Playwright + testing-agent** testing layer (course lessons 16–20) — `cp` it into the kit's `templates/` and note it in the kit's README.

## Testing (component)

- **Vitest + React Testing Library**, configured in the `test` block of
  `client/vite.config.ts` rather than a separate `vitest.config.ts`, so a test resolves
  imports through the same plugins and the same `@/` alias the app does. A run that
  resolved them differently would be testing something the app never executes.
- **Co-located** next to the subject (`src/pages/UsersPage.test.tsx`). `test.include` is
  scoped to `src/**/*.test.{ts,tsx}` so Vitest never collects `e2e/*.spec.ts`, which
  needs a real browser.
- **`globals` is off on purpose** — `describe` / `it` / `expect` / `vi` are imported like
  any other binding, which keeps `tsconfig` free of a `types` entry that exists only to
  describe magic. The cost is that Testing Library's automatic cleanup never registers
  itself, so `src/test/setup.ts` calls `cleanup` in an explicit `afterEach`.
- **Which layer gets a test:** a component test owns the states the real stack will not
  produce on demand — an empty list, a rejected request, a request still in flight. E2E
  owns the proof that the pieces are wired to each other at all. Choose by the question
  being asked, not by which is easier to write.
- **Mock the boundaries, not the internals.** `UsersPage.test.tsx` fakes `@/lib/api` and
  `@/lib/auth-client` — the two modules that talk to a server — and renders the real
  `QueryClientProvider` and a real `MemoryRouter`. A fresh `QueryClient` per test with
  `retry: false`: the module-scope cache that the app wants is the one thing a test must
  not share, and a retry only delays the failure the test is there to read.

## Testing (E2E)

- **Playwright lives at the repo root**, not in a workspace — an E2E run drives client
  *and* server together, so it can't belong to either one.
- **The E2E run is a second copy of the whole app**: API on **3001** (`server/.env.test`),
  Vite on **5174** (`client/.env.test`, `vite --mode test`), database
  **`ticket_management_test`**. Dev on 3000/5173/`ticket_management` keeps running
  untouched. `reuseExistingServer: false` on purpose — reusing whatever already listens
  on a port is how a test run ends up writing to the dev database.
- **Env files:** `server/.env.test` holds secrets → **gitignored**, with
  `server/.env.test.example` committed. `client/.env.test` is only an API URL → committed.
- **Prepare the test DB once** (Postgres must be running):
  `npm run db:migrate:test --workspace server` then `db:seed:test`. After that every
  run resets itself.
- **`globalSetup` (`e2e/global-setup.ts`) migrates, truncates, then re-seeds before each
  run**, so a run always starts from the same two accounts and rows never accumulate.
  Migrating first means a new migration doesn't turn the suite red with a confusing
  "column does not exist". It runs *after* the webServers start — that's Playwright's
  order, not a choice.
- **Three guards keep a test run off the dev database**, because `--env-file` (and
  dotenv) will *not* overwrite a `DATABASE_URL` that is already exported, so an ambient
  value silently outranks `.env.test`:
  1. `global-setup.ts` strips `DATABASE_URL` from the environment it hands the db scripts.
  2. `server/src/db.ts` refuses to start when `NODE_ENV=test` and the database isn't `*_test`.
  3. `prisma/truncate.ts` refuses to wipe anything not named `*_test`.
- `truncate.ts` asks Postgres which tables exist rather than listing them, so a new model
  is covered automatically — a hardcoded list would quietly stop wiping the day one is added.
- **Rate limiting:** Better Auth's limiter is on only when `NODE_ENV=production`
  (`server/src/config.ts`). It stays **on in production** — it blunts credential
  stuffing. The E2E run sets `NODE_ENV=test`, which is the one place it's off, because
  tests sign in far more often than a person and would collect 429s.
- The root `tsconfig.json` + `.oxlintrc.json` exist **only** to gate `e2e/` and
  `playwright.config.ts`; the `ts-check.sh` hook routes root TS edits to them.
- **A spec is only as good as what it asserts.** `route-protection.spec.ts` used to
  check for a placeholder sentence instead of the table's rows; the commit that put
  the real table in removed that sentence and never touched the spec, so two tests
  went red and a third kept passing for the wrong reason. Assert on the data that
  makes the page correct — page chrome proves only that something rendered.
- **Writing specs is delegated to the `e2e-tester` subagent** — give it a flow in plain
  words. Invoke it only once the feature's UI is wired up and **manually working**: it
  iterates against a real browser, so a half-built page burns turns rediscovering that.
  It reports app bugs instead of patching them; applying the fix is on you. How it works
  and the rules it follows live in its own file, not here.

## Which test a change needs

Testing is part of finishing a change, not a decision to weigh afterwards. Read the
table, do what it says, don't ask.

| The change | The test it needs |
| --- | --- |
| A new or changed **endpoint** | an API spec (`e2e/*-api.spec.ts`): status codes **and** the field set of what it returns |
| A new or changed **component that renders more than one way** | a component test beside it |
| A new or changed **flow a user walks through** | an E2E spec |
| A **bug fix** | a test that fails *before* the fix — every time, no exceptions. One that passes before the fix means the cause was misdiagnosed. |
| Static markup, generated files, renames, config | nothing |

A component that renders exactly one way needs no test (`HomePage`), and behaviour another
layer already proves needs no second test (`PasswordInput`'s toggle is clicked in
`login.spec.ts`). **Size is not the criterion:** `ProtectedRoute` is tiny and has four
branches; `HomePage` is a whole page and has none.

**Prove a new test can fail.** Break the code it guards, watch that one test go red,
restore. A test written against already-passing code can assert nothing at all and nobody
finds out — which is exactly how `route-protection.spec.ts` ended up checking for a
sentence the page no longer had.

**Running them:** before proposing a commit that touched `client/`, run
`npm run test:client`. Run `npm run test:e2e` when the change could affect a flow a user
walks through — it needs Postgres up, so check first and say so if it isn't. Never report
a suite as passing without having run it; "should pass" is not a result.

## Workflow

- Built **one phase per session** (phases are defined in the implementation plan).
- Branch: `main`. Commits follow **Conventional Commits**: `type: imperative subject` (≤50 chars, no trailing period), a blank line, then a body wrapped at ~72 cols explaining *why*. Types in use: `feat`, `fix`, `docs`, `chore`, `build`, `refactor`, `test`. End the body with the `Co-Authored-By` trailer.
- Keep the CLAUDE.md files current. Add a convention when it becomes real (not speculative), and **correct one in the same commit that makes it wrong** — a file still documenting a pattern the code no longer uses is worse than one that never mentioned it, because it actively instructs the next reader. Put workspace-specific rules in the workspace file, shared rules here.

## Status

- ✅ **Phase 1** — monorepo skeleton; client + server run.
- ✅ **Server** — Prisma + PostgreSQL; better-auth (email/password, DB sessions, roles, admin seed); CORS for the SPA.
- ✅ **Client** — Tailwind v4, React Router, better-auth client, shadcn/ui; **Login + Home** pages wired to the auth API (login → protected home → logout).
- ✅ **Role-based access** — enforced on **both** sides. Server: `requireAuth` → 401,
  `requireAdmin` → 403. Client: `ProtectedRoute role="admin"` + a NavLink only admins see
  (UX layer; the server is the one that actually refuses).
- ✅ **User list** — `GET /api/users` (admin-only, field allow-list) rendered as a
  read-only shadcn table on `/users`. Verified in a real browser: admin sees the rows,
  an agent gets 403 from the API and is bounced off the route. Create / edit / delete are
  still open (Phase 3).
- ✅ **E2E** — Playwright against a dedicated `ticket_management_test` DB and test ports;
  **48 specs** — the auth system end to end (sign-in, validation, route protection,
  session lifecycle, cookie/CORS/CSRF properties) plus **9 API-level specs** that skip the
  browser and call the server directly, including `GET /api/users` (401 / 403 / 200 and
  its field allow-list). Every run migrates, truncates and re-seeds itself.
- ✅ **Component tests** — Vitest + Testing Library, **9 specs**. `UsersPage` covers all
  four render states (loading, rows, empty, error) and `ProtectedRoute` all four branches
  (loading, signed out, wrong role, allowed). Four of those states are ones E2E cannot
  stage: the server will not return an empty roster or fail on request, and the loading
  states are gone before an assertion can land on them.
- ⏭️ **Next** — the rest of Phase 3 (create / edit / delete a user), then the tickets domain (schema + API + UI).

## Known gaps — deliberately deferred

Each of these is a decision that was postponed, not an oversight. The **trigger** column
is what will make it start hurting; revisit when you hit it.

| Gap | Trigger | What to do |
| --- | --- | --- |
| **Specs run 5-way parallel against one shared test DB.** Safe today only because no spec touches data another spec can see — each just signs in and reads its own session. | The first spec that creates or counts domain rows, i.e. **the tickets domain**. | Give each test its own data (unique subjects per worker) — or, as a blunt fallback, set `workers: 1` in `playwright.config.ts`. Decide before writing ticket specs, not after they go flaky. |
| **`GET /api/users` returns every user, unpaginated.** Fine at three rows. | A real agent roster (dozens+), or a page that has to scroll forever. | Add `take`/`skip` (or cursor) + a total count, and paginate the table. |
| **No catch-all route.** `App.tsx` has `/login`, `/`, `/users` and nothing else, so an unknown URL renders a blank page. | Anyone mistyping a URL; more so once there are more routes. | Add a `*` route with a 404 page, then a spec for it. |
| **No "return to intended page" after sign-in.** A signed-out visit to `/users` lands on `/` after login, not `/users`. | Deep links being shared, or any flow that sends users to a specific page. | Have `ProtectedRoute` record the attempted path and `LoginPage` honour it. |
| **`CardTitle` renders a `div`, not a heading.** Screen readers find no page headings; specs assert body copy instead of `getByRole("heading")`. | Any accessibility pass. | Render page titles as real headings, then switch those assertions over. |
| **The suite is top-heavy** — 48 specs at the E2E layer (9 of them API-level), 9 component specs, no unit tests. Defensible so far: the app has been mostly auth plumbing, and cookies, CORS and CSRF can only be proven with the real stack running. | The tickets domain, which brings rules worth testing in isolation (status transitions, assignment) and many more UI states. | Push new coverage downward — component tests for new UI states, API specs for new endpoints, and server-side unit tests once there is pure logic to isolate. Don't let E2E keep absorbing work the faster layers should carry. |

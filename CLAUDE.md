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
- `core/` — code both workspaces import (see **Shared code** below)
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

## Shared code (`core/`)

One definition, imported by both sides — `core/schemas/users.ts` is read by
`server/src/users/users.routes.ts`, `server/prisma/seed.ts` and
`client/src/features/users/components/CreateUserForm.tsx`. Put anything here
that **both** workspaces must agree on; a rule that only one side enforces does
not belong in it.

- **It is a plain folder, not an npm workspace, and that is the whole trick.** The
  server runs TypeScript natively with no build step, and Node refuses to strip types
  from anything under `node_modules` — which is exactly where npm symlinks a workspace
  package. A folder imported by relative path never goes near `node_modules`, so it
  works. Do not "tidy this up" into a workspace; it will break the server at runtime.
- **Import it by relative path with the `.ts` extension.** Node needs the extension;
  the client has `allowImportingTsExtensions`, so the same spelling works on both
  sides. How many `../` depends on how deep the importing file sits — two from
  `server/prisma/seed.ts`, three from `server/src/users/`, five from
  `client/src/features/users/components/` — so copy the path from a neighbour rather
  than from this line. No alias: one spelling means one thing to look for.
- **`core/package.json` exists only to say `"type": "module"`.** Node and TypeScript's
  `nodenext` resolution both pick CommonJS-vs-ESM from the nearest `package.json`;
  without it they walk up to the repo root, call these files CommonJS, and reject their
  `export`s. It installs nothing and depends on nothing — `zod` resolves from the root
  `node_modules` where npm workspaces hoists it.
- **Both workspaces type-check it**, via `"../core"` in each `include`. That is
  deliberate: the same file has to compile under Node-native TS *and* under the
  bundler, and only running both proves it. The root `.oxlintrc.json` lints it
  (`client` and `server` are in its `ignorePatterns`), so `npm run lint:e2e` covers it
  despite the name. `.claude/hooks/ts-check.sh` routes a `core/` edit to all three.
- **Keep it free of runtime concerns.** No Prisma, no Express, no React, no `process.env`
  — anything that only one side can load stops the other side importing the file at all.

## When to extract a unit

A component, a hook, a module — the question is the same and it is **not** "is this file
long?". Length is a symptom; a file that does one thing at 200 lines is fine and a file
that does three things at 60 is not. Work down this list, and stop at the first **no**.

| Ask | Why it decides |
| --- | --- |
| **1. Does something else call it yet?** | One caller means extracting buys a second file to open and nothing else. Two callers mean the thing has an identity of its own. This is the heaviest question — a *no* here usually ends it. |
| **2. Does it own state or logic?** | A `useState`, a query, a mutation, an event handler — something that can be wrong on its own. Pure JSX moved to another file is the same JSX somewhere less convenient. |
| **3. Would a test aim at it directly?** | `ProtectedRoute` is tiny with four branches and earns its own file; `HomePage` is a whole page with none and does not. Branches, not size. |
| **4. Is it genuinely hard to read in place?** | True sometimes, but it is a feeling. On its own it is not enough — it needs one of the three above behind it. |

**Reasons that are not reasons:**

- **"The linter says the function is too long."** A linter reports; it never prescribes.
  `max-lines-per-function` fired at 106 lines on a three-field form and was used to
  justify extracting a `FormField` wrapper. The real finding was that the rule counted
  comment lines in a codebase whose house style is dense comments (`skipComments` fixed
  it, `77c0154`). Check the tool's configuration before reshaping code to satisfy it.
- **"It removes duplication."** Repetition is only worth removing when the copies must
  change together. Five lines of markup repeated per field, each one independently
  readable, is cheaper than an abstraction a reader has to go and learn.
- **"We might reuse it later."** Usually not, and the guessed API is usually wrong.
  Extract when the second caller actually exists.
- **"It's best practice."** No published practice names a line count. The library's own
  documented shape is the better default — see below.

**Where this has already been decided here:**

- **`FormField` — built and reverted** (2026-10-20). shadcn's `Field` is markup only and
  every documented example wires `id` / `htmlFor` / `aria-invalid` by hand, so a wrapper
  to "fix" that was solving a problem the library does not have. Matching the documented
  shape beats saving five lines a field, because the documented shape is the one a
  tutorial, a search result or a later reading of the docs will agree with.
- **`CreateUserDialog` + `CreateUserForm` — kept**, on question 2 and a technical
  requirement: Radix unmounts `DialogContent` on close, so the `useForm` call living in
  the child is what makes every open start blank.
- **`useCreateUser` — kept in `CreateUserForm.tsx`, not yet its own module.** It passes
  question 2 and fails question 1 while it is the only one. When `PATCH` and `DELETE`
  land, three hooks will need the same `["users"]` key from three components, and *that*
  is the moment they move out together — the extraction follows the second caller, not
  the other way round.

### Folder structure: adopt the rule, not the empty folders

A published convention is a **list of places things may live**, not a checklist to build
on day one. The React reference people actually use is
[bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
— and its own docs say *"You don't need all of these folders for every feature. Only
include the ones that are necessary."*

Split any convention into two parts before adopting it:

- **Its import-direction rules** — which layer may know about which. Expensive to
  retrofit, because by then every file that crossed the line has to be found and
  rewritten. **Take these immediately, and make them a lint rule**, not a paragraph.
- **Its folder names** — cheap either way. Moving a file is `git mv` plus the imports
  `tsc` points at; no logic changes and no test changes. So there is nothing to gain by
  guessing early and nothing lost by waiting.

What is actually expensive is **a layer with no content in it**: `users.controller.ts` →
`users.service.ts` → `users.repository.ts` where each one only forwards to the next, so
reading one endpoint means opening four files to reach a single Prisma call — and the
service API that was guessed before the tickets domain existed is the one that turns out
wrong. Compare `server/src/users/create-user.ts`, which exists because `seed.ts` needed
the same function: the layer followed the second caller.

**Decided here (2026-10-22), client:** adopted `src/features/<domain>/` plus the
three-layer direction rule, enforced in `client/.oxlintrc.json` — see **Where a new
file goes** in [`client/CLAUDE.md`](client/CLAUDE.md). Deliberately *not* adopted:
`src/app/routes/` (`pages/` already holds routes, and bulletproof itself says that layer
depends on the meta-framework — React Router declarative mode has no such layer),
renaming `src/test/` to `testing/`, and pre-creating `api/` · `hooks/` · `types/` inside
a feature. **Server keeps `src/<domain>/` by domain** — Express prescribes no structure
at all — and grows a service or repository file only when a second caller or a rule worth
testing without HTTP shows up.

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
  shadcn table on `/users`. Verified in a real browser: admin sees the rows, an agent
  gets 403 from the API and is bounced off the route.
- ✅ **Create user** — `POST /api/users` (admin-only) behind a dialog on `/users`.
  Public sign-up is disabled, so the endpoint writes the `user` + credential `account`
  pair itself, in one transaction, through `server/src/users/create-user.ts` — the same
  function `prisma/seed.ts` now uses, because a disagreement about `providerId` or the
  hasher produces an account that is created successfully and can never sign in. The
  role is forced to `agent` server-side and the address is lowercased, since
  `/sign-in/email` looks a user up by `email.toLowerCase()`. Edit / delete are still
  open (Phase 3).
- ✅ **E2E** — Playwright against a dedicated `ticket_management_test` DB and test ports;
  **59 specs** — the auth system end to end (sign-in, validation, route protection,
  session lifecycle, cookie/CORS/CSRF properties) plus **17 API-level specs** that skip
  the browser and call the server directly, covering `/api/users` on both verbs: who may
  read and who may create, the field allow-list on each answer, and what a create
  refuses. Every run migrates, truncates and re-seeds itself.
- ✅ **Component tests** — Vitest + Testing Library, **20 specs**. `UsersPage` covers all
  four render states (loading, rows, empty, error), `ProtectedRoute` all four branches
  (loading, signed out, wrong role, allowed), `CreateUserForm` its validation, its
  payload, both failure messages, the invalidation, and that it waits for the refetch
  before reporting success, and `NavBar` what happens when the server refuses a sign-out
  (including a refusal that carries no message to quote).
  Several of those states are ones E2E cannot stage: the server will not return an empty
  roster, fail on request, or reject a sign-out on demand, and the loading states are
  gone before an assertion can land on them.
- ⏭️ **Next** — the rest of Phase 3 (create / edit / delete a user), then the tickets domain (schema + API + UI).

## Known gaps — deliberately deferred

Each of these is a decision that was postponed, not an oversight. The **trigger** column
is what will make it start hurting; revisit when you hit it.

| Gap | Trigger | What to do |
| --- | --- | --- |
| **Specs run 5-way parallel against one shared test DB,** and `globalSetup` truncates once per run rather than per spec — so a row one worker creates is visible to every other. | **Already fired**, with create-user. | Resolved without `workers: 1`: every created row takes its address from `newUserEmail()` in `e2e/support/users.ts` (a UUID — five workers can share a millisecond), and no spec asserts a roster length, count or order. Keep both rules when adding specs that write. |
| **`POST /api/users` has no rate limit.** Better Auth's limiter covers `/api/auth/*` only, so nothing throttles account creation. Low risk while the route is admin-only and sign-up is disabled. | A second admin-reachable write endpoint, or any sign that an admin session could be hijacked. | Put a limiter in front of the app's own mutating routes rather than bolting one onto this endpoint. |
| **`GET /api/users` returns every user, unpaginated.** Fine at three rows. | A real agent roster (dozens+), or a page that has to scroll forever. | Add `take`/`skip` (or cursor) + a total count, and paginate the table. |
| **No catch-all route.** `App.tsx` has `/login`, `/`, `/users` and nothing else, so an unknown URL renders a blank page. | Anyone mistyping a URL; more so once there are more routes. | Add a `*` route with a 404 page, then a spec for it. |
| **No "return to intended page" after sign-in.** A signed-out visit to `/users` lands on `/` after login, not `/users`. | Deep links being shared, or any flow that sends users to a specific page. | Have `ProtectedRoute` record the attempted path and `LoginPage` honour it. |
| **Form fields carry no `aria-describedby`,** so a validation message is announced when it appears (`FieldError` is `role="alert"`) but is not read out when the field is focused again — a screen reader hears "invalid" with no reason. Every documented shadcn `Field` example omits it too; the retired `form.tsx` was the only thing that ever wired it. | An accessibility pass, or the third or fourth form — at which point the wiring is worth centralising. | Give `FieldError` an `id` and point the control's `aria-describedby` at it (unconditionally: `FieldError` renders nothing when empty, and a dangling reference is ignored). A shared wrapper to derive those ids was built and reverted once already — if it comes back, it should come back because several forms need it, not to satisfy a line-count rule. |
| **`CardTitle` renders a `div`, not a heading.** Screen readers find no page headings; specs assert body copy instead of `getByRole("heading")`. | Any accessibility pass. | Render page titles as real headings, then switch those assertions over. |
| **The suite is top-heavy** — 59 specs at the E2E layer (17 of them API-level), 20 component specs, no unit tests. Defensible so far: the app has been mostly auth plumbing, and cookies, CORS and CSRF can only be proven with the real stack running. | The tickets domain, which brings rules worth testing in isolation (status transitions, assignment) and many more UI states. | Push new coverage downward — component tests for new UI states, API specs for new endpoints, and server-side unit tests once there is pure logic to isolate. Don't let E2E keep absorbing work the faster layers should carry. |

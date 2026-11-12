# Ticket Management

An internal **help-desk / support-ticket** app: agents log in to triage, answer, and
resolve tickets; admins additionally manage agent accounts and roles. Monorepo via
**npm workspaces** (`client` + `server`), built phase-by-phase per
`_resources/project/implementation-plan.md`.

**Per-workspace conventions live in [`client/CLAUDE.md`](client/CLAUDE.md) and
[`server/CLAUDE.md`](server/CLAUDE.md).** This file holds the shared, monorepo-level rules.

## Domain

- **Roles:** `admin` (manage users + everything an agent can do) · `agent` (work tickets).
- **Core entities:** User, Ticket (status `open`/`resolved`/`closed`, a nullable category, an
  assigned agent). **A category is a Postgres enum on the ticket, not a table** —
  `general_question` / `technical_question` / `refund_request`. This line promised a
  `Category` entity until 2026-11-08; the reference project has no such table and
  `_resources/project/requirements.md` always said enum.
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

One definition, imported by both sides — `core/schemas/users.ts` holds
`createUserSchema` and `updateUserSchema`, read by
`server/src/users/users.routes.ts`, `server/prisma/seed.ts`,
`client/src/features/users/components/CreateUserForm.tsx` and
`EditUserForm.tsx`. `updateUserSchema` is built with `.extend` off
`createUserSchema` rather than restated, so the rules the two share cannot
drift between creating and editing. The one rule `.extend` cannot share —
password, because editing lets it be absent — is held together instead by
`PASSWORD_MIN_LENGTH` and `PASSWORD_TOO_SHORT`, two consts at the top of the
file: `createUserSchema` states the rule with `.min()`, `updateUserSchema`
restates it inside a `.refine()`, and without those consts the number and the
prose would sit twice inside the one file whose job is to stop exactly that. Put anything here
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
that does three things at 60 is not.

The rules below are the operative ones. The same material worked through from first
principles — with the `FormField` and `UsersTableRow` cases in full — is
`_resources/knowledge/when-to-extract-a-component.md`; correct both when one of them
goes out of date.

**First decide which kind of thing it is**, because the two kinds are judged by
different questions, and getting that backwards is how this repo has gone wrong before.

- **A piece of the UI that mirrors a piece of the data** — one row, one card, one item
  in a list. React's own guidance is the criterion here, and it does not mention reuse
  at all: *"a component should ideally only be concerned with one thing. If it ends up
  growing, it should be decomposed into smaller subcomponents"*, and *"separate your UI
  into components, where each component matches one piece of your data model"*. The
  documented examples (`Recipe` out of `RecipeList`, `Report` out of `ReportList`) each
  have exactly one caller. **Extract when it mirrors one piece of the data — waiting for
  a second caller is the wrong test for this kind.**
- **An abstraction over something else** — a wrapper, a shared helper, a generic
  "field" or "layout" component. Here reuse *is* the test, because the thing has no
  shape of its own until a second caller argues about it.

Then work down, and weigh rather than stop dead:

| Ask | Why it decides |
| --- | --- |
| **1. Does it mirror one piece of the data, or own one concern?** | The React criterion above. A table row, a card, a list item — each matches one record, so it has an identity before anyone reuses it. |
| **2. Does it own state or logic?** | A `useState`, a query, a mutation, an event handler — something that can be wrong on its own. Pure JSX moved to another file is the same JSX somewhere less convenient. |
| **3. Would a test aim at it directly?** | `ProtectedRoute` is tiny with four branches and earns its own file; `HomePage` is a whole page with none and does not. Branches, not size. |
| **4. Is something else calling it yet?** | The heaviest question **for an abstraction**: one caller means a guessed API and a second file to open. For a data-shaped component it carries little — see the split above. |
| **5. Is it genuinely hard to read in place?** | True sometimes, but it is a feeling. On its own it is not enough — it needs one of the four above behind it. |

**This list was reordered on 2026-10-26, and the reason is worth keeping.** It used to
lead with "does something else call it yet?" and say *stop at the first no*. That was
generalised from one case — `FormField`, which really was an abstraction and really did
fail that test. Applied to a table row it gave the wrong answer twice over: it stopped
at question 4 before question 1 or 3 could be heard, and it contradicted React's own
documented criterion, which nobody had checked.

### Surveying for candidates — the part that has gone wrong twice

The five questions above are for judging *one* candidate someone already noticed. The
step before them is noticing, and that is where this repo has actually failed. Use
triggers you can **see**, not taste:

| What is visibly there | What it means | What is owed |
| --- | --- | --- |
| A `.map()` over data inside something that also does other work | the item mirrors one record | extract the item — `UsersTableRow` |
| A container whose structure has to agree with that item: headers, a `colSpan`, a skeleton with one cell per column | the container mirrors the **collection** | extract the container — `UsersTable` |
| **Two or more files that must agree on a count, an order or a shape, with nothing enforcing it** | the boundary is in the wrong place | move them into one file **and assert the agreement in a test** |
| Three or more render states (pending / empty / error / rows) branching inside a page | the state switch belongs to the thing being rendered, not to the page | extract the thing being rendered |

**Procedure for a sweep.** Ask *every* trigger, not the first that matches, and say in
the report which ones were asked. "Surveyed 14 files, found one candidate" is not a
result — it does not say what was looked for. A sweep that finds exactly one candidate
in an app holding a table, a list and four dialogs should be re-run before it is
believed.

**When an extraction leaves an agreement behind, assert it.** Co-location makes a
mismatch easy to notice; a test makes it impossible to ship. `UsersTable.test.tsx`
compares the skeleton's cells, a real row's cells and the empty row's `colSpan` against
the **rendered `columnheader` count** rather than against `5`, so a half-added column
turns three tests red. Comparing against a literal would have passed.

**What went wrong on 2026-10-26, recorded because the shape of the mistake repeats.**
The project-wide sweep asked one question — "what mirrors one row?" — found
`UsersTableRow`, and reported the project surveyed. React's criterion names both halves
(`Recipe` **and** `RecipeList`), and only the record half was looked for, so `UsersTable`
was never considered at all — despite scoring higher on the five questions, since it owns
the three-way body switch as well as the columns. The miss then produced a second one:
`client/CLAUDE.md` claimed a column added without its `colSpan` would need "new counts in
the test", while every test counted `row` and none counted `cell`. **A claim that a
mistake would be caught is worth checking against the test that supposedly catches it.**

**Reasons that are not reasons:**

- **"The linter says the function is too long."** A linter reports; it never prescribes.
  `max-lines-per-function` is now **off in all three configs**, because it never once
  produced a finding worth acting on: it fired at 106 lines on a three-field form (while
  miscounting comments, and was nearly used to justify the `FormField` wrapper that had
  to be reverted) and at 110 on `UsersPage`, which was ~25 lines of logic under ~85 of
  JSX. A component's length is mostly markup, so the rule measures the wrong thing here.
  Keeping a warning the house rule pre-commits to ignoring only teaches you to skim past
  lint output. **`max-lines` (whole file) stays** — it fired once, on a spec file holding
  three verbs, and splitting it was right. The general lesson survives the removal: check
  what the tool is measuring before reshaping code to satisfy it.
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
- **`CreateUserDialog` + `CreateUserForm` — kept**, on "does it own state or logic"
  and a technical requirement: Radix unmounts `DialogContent` on close, so the `useForm` call living in
  the child is what makes every open start blank.
- **`useCreateUser` and `useUpdateUser` — moved into `features/users/api/`**
  (2026-10-23), and the reason matters more than the move. It was **not** the
  second-caller question: each hook still has exactly one caller, and *a second
  near-identical hook is not a second caller*. It was the **Folder structure** rule below — where a file lives is the
  cheap half — plus one thing that was genuinely stuck: `UserRow` described the users
  feature's data from inside `pages/UsersPage.tsx`, and a feature may not import from
  `pages/`, so `EditUserForm` had to restate the fields it needed. Moving the row type
  into `api/get-users.ts` is what let it become `Pick<UserRow, …>`; the two hooks came
  along because splitting their folder from the type's would have been the worse half of
  a move. They stay **two hooks, not one that branches** — see `client/CLAUDE.md`.

- **`UsersTableRow` — extracted** (2026-10-26), and it is the first decision made under
  the reordered list above rather than the old one. It is a data-shaped component: one
  row, one user, matching React's own criterion. Under the previous ordering it was
  refused twice, because "does something else call it yet?" said no and stopped the
  list before "would a test aim at it?" could say yes. The payoff is exactly that test:
  the three conditions a row decides (muted, badged, which buttons) are now reached with
  one prop instead of through a page, a fake roster request, a query client and a
  router. The row is 39 lines — the point is
  not the arithmetic but that the row now has a name and a test of its own.

- **`UsersTable` — extracted** (2026-11-02), and it is the candidate the 2026-10-26 sweep
  should have found. It is the collection half of the same criterion: React's documented
  examples pair `Recipe` with `RecipeList`, and only the first was looked for. It scores
  higher than the row did — it mirrors the collection (Q1), owns the three-way switch
  between skeleton, empty row and rows (Q2), and three tests aim straight at it (Q3).
  **What forced it was not the page's length but an agreement no one was enforcing:** the
  headers, the empty row's `colSpan` and the skeleton's cell count sat in `UsersPage`
  while the data cells sat in `UsersTableRow`, so adding a column meant editing two files
  and nothing said when one was forgotten — and the doc wrongly claimed a test would
  notice. `UsersPage` is now 45 lines of code, the table is 92, and the three tests
  compare every body against the rendered header count instead of a literal 5.

- **`TicketsTable` + `TicketsTableRow` — both extracted on day one** (2026-11-11), which
  is the standing correction to the 2026-10-26 miss: the criterion names both halves, so
  both are looked for up front instead of one being found by a later sweep. Nothing new
  was decided here; the interest is that the list above was applied without a sweep at
  all.

- **A shared `DataTable` — refused** (2026-11-11), and it is the first case where
  question 4 said *yes* and the answer was still no. `UsersTable` and `TicketsTable` have
  the same four parts — headers, skeleton, empty row, `.map` — so the second caller an
  abstraction waits for genuinely exists. What decided it is the other rule: **repetition
  is worth removing when the copies must change together**, and these never do. A column
  added to the roster says nothing about the ticket list. Two further facts settled it:
  a hand-rolled `DataTable` has to take a column-definition array, which is what TanStack
  Table already is, and sorting / filtering / pagination are arriving at the ticket list
  and not at the roster — so the guessed API would be reshaped immediately. **Trigger: a
  third table, or the sorting step.** The honest cost is JSX that looks alike in two
  places, and `splitRows()` duplicated across the two table tests.

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
renaming `src/test/` to `testing/`, and pre-creating a feature's sub-folders before
anything goes in them — `api/` was added on 2026-10-23 because three endpoints and a
row type needed a home, while `hooks/` · `types/` · `stores/` still do not exist. **Server keeps `src/<domain>/` by domain** — Express prescribes no structure
at all — and grows a service or repository file only when a second caller or a rule worth
testing without HTTP shows up.

## Workflow

- Built **one phase per session** (phases are defined in the implementation plan).
- Branch: `main`. Commits follow **Conventional Commits**: `type: imperative subject` (≤50 chars, no trailing period), a blank line, then a body wrapped at ~72 cols explaining *why*. Types in use: `feat`, `fix`, `docs`, `chore`, `build`, `refactor`, `test`. End the body with the `Co-Authored-By` trailer.
- Keep the CLAUDE.md files current. Add a convention when it becomes real (not speculative), and **correct one in the same commit that makes it wrong** — a file still documenting a pattern the code no longer uses is worse than one that never mentioned it, because it actively instructs the next reader. Put workspace-specific rules in the workspace file, shared rules here.

### The loop for one unit of work

**Scoped to this repo on purpose.** This is one AI-coding workflow being tried, not a
house standard — the next project is meant to try a different one. That is why it lives
here and not in `Practice/CLAUDE.md`, which every project inherits, and why it does not
go into `_setup-kit/` until a second project has actually used it.

1. **Plan mode → review the plan → implement.** Shape is settled here.
2. **Smoke pass (the user).** Drive the happy path once by hand in a real browser, ~2
   minutes. One line, no edge cases. This is a **gate, not a test**: `e2e-tester` cannot
   tell a spec that went red from its own locator from one that went red because the page
   is broken, so a page that does not render yet costs it several boot-a-browser rounds to
   rediscover what a single click would have shown.
3. **Review list (Claude writes, the user reads the code).** Ordered the way the code
   connects — schema → endpoint → auth → client — saying per file whether to read the
   whole thing or only the diff, flagging anything done differently from what was agreed,
   and splitting proven from assumed. Whatever it turns up is applied before step 4 starts.
4. **Tests, reviewers, docs — one block (Claude).** The tests **Which test a change
   needs** calls for, each one proven able to fail; then `clean-code-reviewer`, plus
   `security-reviewer` when the change touched auth or an endpoint; then any CLAUDE.md
   line this work has just made wrong. Ends with a short summary of what each test covers.
5. **Recheck, then commit (the user).** Drive the app properly now that the code is
   stable, and say when to commit.

**Why the code review comes before the tests.** The review is the cheap filter and a spec
is the expensive, brittle artifact: feedback that changes an endpoint's field set or
renames a component invalidates every spec asserting the old shape. It is the same reason
step 2 sits where it does. Worth recording because the first version of this section
argued the opposite — it put tests first so the one list could carry test summaries, which
traded the ordering away for something step 4 can hand over by itself.

**So the review arrives in two pieces, by request:** the ordered code list at step 3, the
test-coverage summary at step 4. One list holding both cannot exist before the tests do,
and waiting for them is what pushed the code review too late.

**A "shape check" is not a step of its own.** Reading what was created and where it was
put is the first thing step 3's ordering hands you.

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
  `/sign-in/email` looks a user up by `email.toLowerCase()`.
- ✅ **Edit user** — `PATCH /api/users/:id` (admin-only) behind a pencil button on each
  row of `/users`, opening a dialog prefilled with that row. **A blank password field
  means "leave the password alone"**, and it has to travel as an *absent* JSON field:
  the server hashes whatever it is sent, so a second hash of the same string is a
  different hash and "no change" cannot be "the same value resent".
  `updateUserSchema` turns `""` into `undefined` and `JSON.stringify` drops it. Role
  stays uneditable — no endpoint reads a role from a body — and Save is disabled until
  something differs from the row.
- ✅ **Delete user** — `DELETE /api/users/:id` (admin-only) behind a trash button on
  each row, guarded by an `AlertDialog`. It is a **soft delete**: `deletedAt` is
  stamped, the row stays, and the roster goes on listing it muted with a `Deleted`
  badge — which is what later explains why its address still answers 409 to a create.
  **Admins can never be deleted** (`403 admin_not_deletable`, and no button on their
  row), and the rule lives in the `WHERE` so the database enforces it rather than a
  check-then-act. Deleting is idempotent and keeps the first timestamp.
  **The deleted person is put out and kept out, in three layers** — their session rows
  are wiped in the same transaction as the flag, `auth.ts` refuses them a new session
  with the *same* answer a wrong password gets, and the client's 401 interceptor sends
  the browser to `/login`. The course's reference project stops after the first, which
  leaves a deleted user able to sign in and then fail on everything.
- ✅ **E2E** — Playwright against a dedicated `ticket_management_test` DB and test ports;
  **124 specs** — the auth system end to end (sign-in, validation, route protection,
  session lifecycle, cookie/CORS/CSRF properties) plus **70 API-level specs** that skip
  the browser and call the server directly, covering `/api/users` on all four verbs:
  who may read, create, edit and delete, the field allow-list on every answer, and what
  each one refuses. Three of those settle things only a real sign-in can: an edit
  carrying no password leaves the old one working while one carrying a password
  replaces it, a deleted user's live cookie stops resolving, and they cannot sign back
  in — with an answer byte-identical to a wrong password. Every run migrates, truncates
  and re-seeds itself.
- ✅ **Component tests** — Vitest + Testing Library, **61 specs**. `UsersPage` covers what
  only the page can answer — that the roster it fetched reaches the table, and that a
  failed first load shows the message with no table at all — while `UsersTable` owns the
  three bodies (skeleton, empty, rows) and, in all three, that every one of them spans
  the **rendered** header count rather than a hardcoded 5, `ProtectedRoute` all four branches
  (loading, signed out, wrong role, allowed), `CreateUserForm` its validation, its
  payload, both failure messages, the invalidation, that it waits for the refetch
  before reporting success, and that the submit button will not take a second click
  while the first is unanswered, `CreateUserDialog` that each open mounts a blank form
  so neither an abandoned draft nor a stale error can reappear, `EditUserForm` the
  prefill, the Save button staying disabled until something differs from the row, both
  failure messages, the invalidation, and — the feature's central rule — that a blank
  password field produces a request body with **no `password` key at all** while a typed
  one sends it, `EditUserDialog` that each open re-reads the row rather than reviving an
  abandoned edit, `DeleteUserDialog` that it asks before it deletes, that Cancel
  sends nothing, that the dialog stays up and takes one click while the request is
  unanswered, that a refused delete is reported without two dialogs on screen at once,
  and that it names the right cache key, `UsersTableRow` the three conditions one row
  decides (a live user with both actions, a deleted one badged and offering none, an
  admin that can be edited but not deleted), `api` that a 401 sends the browser to
  `/login` while a 403 is handed back untouched, and `NavBar` what happens when the server refuses a sign-out
  (including a refusal that carries no message to quote).
  Several of those states are ones E2E cannot stage: the server will not return an empty
  roster, fail on request, or reject a sign-out on demand, the loading states are
  gone before an assertion can land on them, and a request can only be held unanswered
  where the client is the one answering it.
  The tickets feature adds twelve: `TicketsTable` owns the three bodies and, in all
  three, that each spans the **rendered** header count — the column total is pinned once,
  deliberately, so adding a column makes somebody come and agree to it — plus that rows
  render in the order they were given, since the server decides that order and the client
  must not re-decide it; `TicketsTableRow` owns the three conditions one row answers
  (each status shown as a word rather than its enum spelling, a category likewise, and an
  em dash where nothing has classified the ticket yet) while deliberately asserting
  nothing about which `Badge` variant a status gets, because that is a class; and
  `TicketsPage` owns what only a page can — that the list it fetched reaches the table,
  that it asks the endpoint the list actually lives at, and that a failed first load
  shows the message with no table at all. Its session is faked as an **agent**, not an
  admin, which is a quiet assertion that neither the page nor the endpoint needs one.
- ✅ **Tickets — inbound webhook** — the `Ticket` model (`open`/`resolved`/`closed`,
  a nullable `TicketCategory`, `senderName`/`senderEmail`, `bodyHtml`, a nullable
  `assignedTo` relation) and **`POST /api/webhooks/inbound-email`**, the one route in the
  app not called by a person. It is guarded by `requireWebhookSecret` — a shared secret
  in the `x-webhook-secret` header, compared with `timingSafeEqual`, read at module load
  so a missing `WEBHOOK_SECRET` refuses to start — because `requireAuth` asks "is there a
  session?", which a mail provider can never answer. A **duplicate guard**, not threading:
  a `Re:`/`Fwd:` follow-up from the same sender on the same subject answers `200` with the
  ticket that already exists. It fires **only** when the subject claims to be a reply,
  which is where it leaves the reference project: that one matches any subject, so two
  unrelated emails titled "Help" collapse into one ticket and the second body is written
  nowhere. The match is plain equality against a stored `subjectNormalized` column, and
  that is a security boundary: comparing `subject` with Prisma's `mode: "insensitive"`
  compiles to `ILIKE`, which left `%` a live wildcard — `Re: %` read back any open ticket
  of any address, body included (confirmed against a running server, fixed 2026-11-10).
  24 API specs, every one proven to fail.
  Deliberately absent: a `Reply` model, `GET`/`PATCH /api/tickets`, any UI, a mail
  provider (the body is plain JSON, which is what the reference project's own step does),
  and `messageId` — no caller sends one yet.
- ✅ **Ticket list** — `GET /api/tickets` rendered as a table on `/tickets`. It is the
  **first route in the app guarded by `requireAuth` alone**: `/api/users` is admin-only
  because managing accounts is an admin's job, while working tickets is what an agent is
  for. The endpoint has **its own allow-list, narrower than the webhook's** — seven
  fields, with `body` and `bodyHtml` deliberately left out, because a list renders
  neither and `bodyHtml` is stored unsanitised. Newest first, decided by the server, and
  **no query parameters at all**. The client mirrors `features/users/`: `TicketsTable`
  (headers, `colSpan`, skeleton) and `TicketsTableRow` (one ticket) both extracted on day
  one, with status and category rendered through `Record`-typed label maps so a value
  nobody wrote a label for fails `tsc`. `prisma/seed-tickets.ts` (`db:reseed:tickets`)
  gives the dev database rows to look at and refuses any database named `*_test`.
  Deliberately absent: sorting, filtering, search, pagination, the detail page,
  assignment, and any way to change a ticket.
- ⏭️ **Next** — sorting and filtering on the list (endpoint and UI), then pagination,
  the detail page, assignment.

## Known gaps — deliberately deferred

Each of these is a decision that was postponed, not an oversight. The **trigger** column
is what will make it start hurting; revisit when you hit it.

| Gap | Trigger | What to do |
| --- | --- | --- |
| **Specs run 5-way parallel against one shared test DB,** and `globalSetup` truncates once per run rather than per spec — so a row one worker creates is visible to every other. | **Already fired**, with create-user. | Resolved without `workers: 1`: every created row takes its address from `newUserEmail()` in `e2e/support/users.ts` (a UUID — five workers can share a millisecond), and no spec asserts a roster length, count or order. Keep both rules when adding specs that write. |
| **The app's own mutating routes have no rate limit**, and the webhook's secret can therefore be guessed at indefinitely. A refusal is now `console.warn`ed (added 2026-11-10) so it is at least visible, but nothing stops it. Better Auth's limiter covers `/api/auth/*` only. | **Already fired, and wider than this row used to say.** It read "a second admin-reachable write endpoint"; the webhook is a second mutating endpoint reachable with **no session at all**, only a shared secret — so anyone holding that secret can create tickets without limit. | Still the same answer: a limiter in front of the app's own mutating routes rather than bolted onto one endpoint. Do it when the webhook is exposed to the internet, which is the same moment a real mail provider is wired up. |
| **Two list endpoints return every row, unpaginated** — `GET /api/users` and, since 2026-11-11, `GET /api/tickets`. Fine at three rows and six. | Different for each, and the ticket one is much nearer: a roster only grows when an admin adds somebody, while the ticket table grows from **`POST /api/webhooks/inbound-email`, which has no rate limit** (its own row above) — so anyone holding that secret can inflate what every agent's page load then reads in full, over an `ORDER BY createdAt` with no index behind it. | Add `take`/`skip` (or cursor) + a total count, and paginate both tables. **Do the tickets one before a real mail provider is connected**, which is the same moment the webhook stops being reachable only by us — not "when the list feels long". The `createdAt` index lands with it; `schema.prisma` records that trigger on the model. |
| **No catch-all route.** `App.tsx` has `/login`, `/`, `/users` and nothing else, so an unknown URL renders a blank page. | Anyone mistyping a URL; more so once there are more routes. | Add a `*` route with a 404 page, then a spec for it. |
| **No "return to intended page" after sign-in.** A signed-out visit to `/users` lands on `/` after login, not `/users`. | Deep links being shared, or any flow that sends users to a specific page. | Have `ProtectedRoute` record the attempted path and `LoginPage` honour it. |
| **Form fields carry no `aria-describedby`,** so a validation message is announced when it appears (`FieldError` is `role="alert"`) but is not read out when the field is focused again — a screen reader hears "invalid" with no reason. Every documented shadcn `Field` example omits it too; the retired `form.tsx` was the only thing that ever wired it. | An accessibility pass, or the third or fourth form — at which point the wiring is worth centralising. | Give `FieldError` an `id` and point the control's `aria-describedby` at it (unconditionally: `FieldError` renders nothing when empty, and a dangling reference is ignored). A shared wrapper to derive those ids was built and reverted once already — if it comes back, it should come back because several forms need it, not to satisfy a line-count rule. |
| **Changing a password does not end that user's sessions.** Better Auth's sessions are rows keyed by token, not by the password hash, so an admin resetting an agent's password leaves anyone already signed in as that agent signed in. | Any sign a password is being reset *because* an account is compromised — or a "sign out everywhere" button, which is the same mechanism. | Delete that user's `session` rows in the same transaction as the password write in `server/src/users/update-user.ts`, and add an API spec that proves the old cookie stops working. **`server/src/users/delete-user.ts` now does exactly that**, so this is a copy of a working mechanism from the file next door rather than new work. Still decided against (2026-10-23): it is a second concern inside an edit form, and the honest version needs a way to tell "reset because compromised" from "reset because forgotten". |
| **`CardTitle` renders a `div`, not a heading.** Screen readers find no page headings; specs assert body copy instead of `getByRole("heading")`. | Any accessibility pass. | Render page titles as real headings, then switch those assertions over. |
| **A sign-in that races a delete leaves a session Better Auth's own routes still honour.** `auth.ts` refuses the session, and `requireAuth` 401s it — but `index.ts` mounts `/api/auth/*` **above** `requireAuth`, so a session born in that window still gets 200 from `get-session` and can reach `change-password`, `update-user` and friends. The client then believes it is signed in while every app call 401s, and `LoginPage` bounces the interceptor's redirect back to `/`. | Any evidence it has actually happened, or a second place that creates sessions. | The window is already narrowed twice (a post-commit session sweep, and the guard in `requireAuth`). Closing it needs a check inside Better Auth's own request path — its `admin` plugin's `banned` field is the mechanism that does this, so adopting that plugin is the real fix and a bigger decision than this feature was. |
| **`forget-password` would mail a deleted user a working reset link.** The route reads the user by address and nothing there consults `deletedAt`. Harmless today: `emailAndPassword.sendResetPassword` is not configured, so the route cannot do anything. | The day password reset is turned on. | Add the same `deletedAt` check to that path, or move the check into a place every Better Auth route crosses. |
| **`security.spec.ts`'s "accepts the very same sign-in from the trusted origin" has flaked once.** Seen in one full run of three on 2026-11-05; 40/40 green across four repeats of that file alone, so it is load-dependent rather than a logic fault — most likely several workers' sign-ins hashing at once, since Argon2 is deliberately slow. | A second sighting, or any other sign-in spec joining it. | Capture the failure message before theorising — this row records a symptom, not a diagnosis. Raising that spec's timeout would hide it rather than answer it. |
| **The suite is top-heavy** — 124 specs at the E2E layer (70 of them API-level), 61 component specs, and nothing that runs server code without going through HTTP. Defensible so far: the app has been mostly auth plumbing, and cookies, CORS and CSRF can only be proven with the real stack running. | **Half fired** with the ticket list, and the response was the right one: of the 22 new specs, 12 are component tests and 6 more are API-level; only 4 need a browser at all. What has *not* arrived yet is server logic worth isolating. |  Push new coverage downward — component tests for new UI states, API specs for new endpoints, and, once there is server logic worth isolating (status transitions are the first), a test runner in `server/` so it can be reached without HTTP. **Say "runs without HTTP", not "unit test":** that row used to read "no unit tests" while 49 component specs existed, which reads as having none at all. The axis that matters is what a test has to boot, not what it is called. |
| **A follow-up email that the duplicate guard matches is thrown away.** `POST /api/webhooks/inbound-email` answers `200` with the existing ticket and writes nothing — there is no `Reply` model yet, so the customer's second message is stored nowhere. | Already real, and the reason the guard was narrowed to subjects starting `Re:`/`Fwd:` rather than matching any subject the way the reference project does: that narrowing bounds the loss, it does not stop it. | Add the `Reply` model and append the follow-up to the ticket, which is what the reference project's own `Add the ability to receive emails` step does. |
| **Threading is a subject heuristic, not RFC 5322.** The guard matches on `senderEmail` + the subject with `Re:`/`Fwd:` stripped, so a localised prefix (`AW:`, `Antwort:`, `回复:`, `RE[2]:`), a `Fw:`, or a customer editing the subject all miss. | A mail provider being connected — at which point `Message-ID` / `In-Reply-To` / `References` actually start arriving (SendGrid Inbound Parse posts them in its `headers` field). | Store `messageId` (unique, which also makes a retried delivery idempotent) and match on `In-Reply-To`/`References` first, keeping the subject heuristic as a fallback. Not built now because nothing sends a message id to this endpoint yet. |
| **A malformed inbound email answers `400`.** Correct for a caller that can fix the body; wrong for a mail provider, which will retry a permanently-invalid email and then drop it silently. | A real provider posting to this route. | Decide the webhook's semantics then: answer `2xx` for anything permanently unprocessable and record it, reserving non-2xx for "retry me". |
| **A subject of only `Re:` stores an empty subject.** `subject` is validated non-empty *before* the prefix is stripped, so `"Re:"` passes and then normalises to `""`. | Anyone noticing a nameless ticket. | Fall back to the untrimmed subject when stripping empties it — with a spec, since the current behaviour has none. |
| **`WEBHOOK_SECRET` has no entropy floor, and a non-ASCII one would never match.** `WEBHOOK_SECRET=abc` starts the server; `.env.example` only *recommends* `openssl rand -base64 32`. Separately, Node decodes header values as latin1 while the guard encodes with `utf8`, so a secret with non-ASCII characters would 401 every delivery. | Rotating the secret by hand, or a deployment where the value is set by someone who did not read `.env.example`. | Throw at module load below some length. **Not done deliberately:** `BETTER_AUTH_SECRET` has no floor either, so adding one here alone would be inconsistent — and the current dev value is 28 characters, so a 32 floor would refuse to start the dev server. Do both secrets together, and pick the floor from what the dev values actually are. |
| **The webhook's guard runs *after* `express.json()`.** An unauthenticated caller can make the server parse up to 100kb before being refused, because the parser is mounted app-wide above the route. | Raising `express.json()`'s `limit` for a provider that posts large mail — at which point the amount parsed before authentication rises with it. | Mount the guard in front of a route-specific parser: `app.use(path, requireWebhookSecret, express.json({ limit }), router)`. |
| **`bodyHtml` is stored raw and nothing sanitises it on write.** Blast radius today is still zero, but it is no longer zero *by default*: `GET /api/tickets` could have returned the column and does not, because `TICKET_LIST_FIELDS` in `server/src/tickets/tickets.routes.ts` leaves it out and `e2e/tickets-api.spec.ts` asserts no row carries it. Traced 2026-11-12: nothing in `client/` reads or renders it, no `dangerouslySetInnerHTML` outside `components/ui/`, and the only endpoint returning it answers the caller who just sent it. **Widening that select is what makes this row wrong** — check it before adding a field. | The ticket detail page, **or Phase 5's AI features** — and the second is the one that matters, because feeding `body`/`bodyHtml` to a model is **prompt injection**, which no HTML sanitiser addresses: `<div style="display:none">ignore previous instructions…</div>` survives DOMPurify and a human reader but not a tokeniser. | Sanitise on write *in addition to* on render — keep the raw column, write a sanitised one, and have every consumer read only that, so "forgot to sanitise" becomes impossible rather than something to remember. Add a CSP header before the detail page ships. |
| **The client hand-writes `TicketStatus` and `TicketCategory`, and nothing checks them against `schema.prisma`.** `client/src/features/tickets/api/get-tickets.ts` spells both unions out, because it cannot import a Prisma type and `erasableSyntaxOnly` rules out an enum on either side. Add a member to the schema, migrate, generate, forget the client — and **nothing goes red anywhere**: the server has no exhaustive reader of its own (widening a union never breaks a reader), and no type links the schema to those literals. The ticket then renders as an **empty badge**, which reads as "no status yet" rather than as a fault, so nobody reports it. | Phase 5's classifier, which is the first thing likely to touch the category set. | A 4-line type-level assertion in `tickets.routes.ts` was written, **proven to fail on a simulated drift**, and then removed the same day (2026-11-12): its error read `Type 'false' does not satisfy the constraint 'true'`, which names neither the missing value nor the file to edit, and it only caught *additions* despite a comment claiming otherwise. If it comes back, use the form whose message names the member — `type MustCover<T extends Record<TicketStatus, true>> = T` — and weigh it against what it actually prevents, which is cosmetic and reachable only from a deliberate edit. |
| **`subject` and `subjectNormalized` have to agree, and nothing enforces it.** The second column is what lets the duplicate guard compare with `=` instead of `ILIKE` (see the Tickets section in `server/CLAUDE.md` for why that is a security boundary), but it is an ordinary column the application fills. Safe today only because each writer derives one from the other in one place. **There are two writers now**, not one: `prisma/seed-tickets.ts` arrived 2026-11-11 and lower-cases the subject in a single helper for the same reason. That is not the writer this row warns about — it is a dev script nobody deploys — but it is the first proof the rule needs stating rather than being obvious. | A second writer of tickets — `PATCH /api/tickets/:id` is the one coming, and a subject it can edit is exactly the case that breaks this. Forget the normalised column there and the guard goes on matching the old value, silently: replies stop joining their ticket and nothing goes red. | Strongest first: make it a **Postgres generated column** (`GENERATED ALWAYS AS (lower(subject)) STORED`), so the database derives it and drift becomes impossible — check first whether Prisma 7 can model a generated column or whether it has to be raw migration SQL plus a field it never writes. Otherwise give the write a single owner (one function both callers go through, the way `create-user.ts` is shared with the seed) **and** assert the agreement in a spec, which is what the repo's own rule asks for when two things must match with nothing enforcing it. |

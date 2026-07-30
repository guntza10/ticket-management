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
| Client | React 19, TypeScript, Vite 8, Tailwind v4, React Router 8 (declarative), react-hook-form + zod, shadcn/ui, better-auth client |
| Server | Express 5, Node 24 (native TS), Prisma 7 + PostgreSQL, better-auth |
| E2E | Playwright (repo root: `playwright.config.ts` + `e2e/`) |
| Tooling | npm workspaces, oxlint (client), Vitest (planned) |

## Prerequisites

- Node.js **24+** — the server runs TypeScript natively (type stripping), no build step
- npm 10+
- PostgreSQL on **localhost:5432** (DB `ticket_management`) — see `server/CLAUDE.md`

## Commands

Run from the repo root:

- `npm install` — install all workspaces
- `npm run dev:server` — Express API → http://localhost:3000
- `npm run dev:client` — Vite dev server → http://localhost:5173
- `npm run build:client` — type-check + build the client
- `npm run typecheck:server` — type-check the server
- `npm run lint --workspace client` — lint the client (oxlint)
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
- **Subjective clean-code** (naming, single-responsibility, abstraction, readability) — what the linter can't judge — is reviewed by the **`clean-code-reviewer` subagent**. Invoke it after writing a meaningful chunk of TS (a component / module / feature) or before a commit — **not** on every edit (a per-edit LLM review is slow and can loop). It's read-only; apply its findings yourself. Don't duplicate the objective rules the hook already gates.
- **Reusable setup kit:** generalizable governance/config (the clean-TS hook, reviewer agents, lint/tsconfig) is captured in `~/Desktop/Practice/_setup-kit/`. When a new reusable piece is built here — e.g. the **Playwright + testing-agent** testing layer (course lessons 16–20) — `cp` it into the kit's `templates/` and note it in the kit's README.

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
  `npm run db:migrate:test --workspace server` then `db:seed:test`.
- **Rate limiting:** Better Auth's limiter is on only when `NODE_ENV=production`
  (`server/src/config.ts`). It stays **on in production** — it blunts credential
  stuffing. The E2E run sets `NODE_ENV=test`, which is the one place it's off, because
  tests sign in far more often than a person and would collect 429s.
- The root `tsconfig.json` + `.oxlintrc.json` exist **only** to gate `e2e/` and
  `playwright.config.ts`; the `ts-check.sh` hook routes root TS edits to them.

## Workflow

- Built **one phase per session** (phases are defined in the implementation plan).
- Branch: `main`. Commits follow **Conventional Commits**: `type: imperative subject` (≤50 chars, no trailing period), a blank line, then a body wrapped at ~72 cols explaining *why*. Types in use: `feat`, `fix`, `docs`, `chore`, `build`, `refactor`, `test`. End the body with the `Co-Authored-By` trailer.
- Keep the CLAUDE.md files current: add conventions as they become real (not speculative); put workspace-specific rules in the workspace file, shared rules here.

## Status

- ✅ **Phase 1** — monorepo skeleton; client + server run.
- ✅ **Server** — Prisma + PostgreSQL; better-auth (email/password, DB sessions, roles, admin seed); CORS for the SPA.
- ✅ **Client** — Tailwind v4, React Router, better-auth client, shadcn/ui; **Login + Home** pages wired to the auth API (login → protected home → logout).
- ✅ **Role-based access** — client infers the `role` field; `ProtectedRoute` takes an optional `role`; **admin-only `/users`** placeholder page + a NavLink shown only to admins. Client-side UX guard only — server enforcement comes with the real endpoint.
- ✅ **E2E harness** — Playwright + a dedicated `ticket_management_test` DB and test
  ports; **no specs written yet** (setup + config only, verified by a throwaway
  login spec that passed and was removed).
- ⏭️ **Next** — the tickets domain (schema + API + UI); a real admin-only users list (server `requireAdmin` + `GET /api/users`).

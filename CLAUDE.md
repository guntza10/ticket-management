# Ticket Management

An internal **help-desk / support-ticket** app: agents log in to triage, answer, and
resolve tickets; admins additionally manage agent accounts and roles. Monorepo via
**npm workspaces** (`client` + `server`), built phase-by-phase per
`_resources/project/implementation-plan.md`.

## Domain

- **Roles:** `admin` (manage users + everything an agent can do) · `agent` (work tickets).
- **Core entities:** User, Ticket (status `open`/`resolved`/`closed`, a category, an assigned agent), Category.
- **Later phases:** a knowledge base and AI features (auto-classify category, summarize a ticket, suggest a reply — agent reviews before sending).

Schema and API don't exist yet — they arrive in later phases. See the implementation plan.

## Tech stack

| Layer | Stack |
| --- | --- |
| Client | React 19, TypeScript, Vite 8 (SPA) |
| Server | Express 5, TypeScript, Node 24 (native TS execution) |
| Tooling | npm workspaces, oxlint (client) |
| Planned | PostgreSQL + Prisma, Tailwind v4, React Router (declarative), better-auth, Vitest |

## Prerequisites

- Node.js **24+** — the server runs TypeScript natively (type stripping), no build step
- npm 10+

## Commands

Run from the repo root:

- `npm install` — install all workspaces
- `npm run dev:server` — Express API → http://localhost:3000
- `npm run dev:client` — Vite dev server → http://localhost:5173
- `npm run build:client` — type-check + build the client
- `npm run typecheck:server` — type-check the server
- `npm run lint --workspace client` — lint the client (oxlint)

Ports: server **3000**, client **5173**. (They are not wired together yet.)

## Structure

- `client/` — React + TypeScript + Vite (SPA)
- `server/` — Express + TypeScript (API)
- `_resources/` — planning docs (implementation plan, requirements)

## Conventions

- **Package manager:** npm workspaces (bun is not installed on this machine).
- **Server runtime:** Node 24 runs `.ts` directly via type stripping — **do not add `tsx` or a build step.** Dev uses `node --watch`. The server `tsconfig.json` is type-check-only (Node ignores it at runtime); `erasableSyntaxOnly` is on, so **no enums / parameter-properties / decorators** in server code.
- **Versions:** intentionally on the latest (Vite 8 / TS 6). Pinning to the course reference (Vite 7 / TS 5) is an open decision — ask before changing.
- **Client (later phases):** React Router in **declarative mode**; Tailwind **v4** (CSS-first).
- **Skills:** vendored as real files under `.claude/skills/` (committed). `.agents/` is gitignored; `skills-lock.json` is the source of truth.
- **Secrets:** never commit. Use `.env` (gitignored) + `.env.example`, and expand env vars in configs (e.g. `.mcp.json`).

## Workflow

- Built **one phase per session** (phases are defined in the implementation plan).
- Branch: `main`. Commits: short imperative subject + a body explaining *why*.
- Keep this file current: add conventions as they become real (not speculative), and split into `client/CLAUDE.md` / `server/CLAUDE.md` once a workspace's rules outgrow the root.

## Status

Phase 1 (skeleton) is done — `client` and `server` run independently and are **not yet wired together**.
Next: PostgreSQL + Prisma, `.env`, Tailwind, React Router, then connect client ↔ server.

# Ticket Management

An internal help-desk / support-ticket app. Agents log in to triage, answer and
resolve tickets; admins additionally manage agent accounts and roles.

Monorepo built with npm workspaces — a React SPA (`client/`) talking to an
Express API (`server/`) over CORS with cookie-based sessions.

> Personal learning / portfolio project, built phase by phase per
> [`_resources/project/implementation-plan.md`](_resources/project/implementation-plan.md).

## Tech stack

| Layer | Stack |
| --- | --- |
| Client | React 19, TypeScript, Vite 8, Tailwind v4, React Router 8 (declarative), react-hook-form + zod, shadcn/ui, better-auth client |
| Server | Express 5, Node 24 (native TS — no build step), Prisma 7 + PostgreSQL, better-auth |
| Tooling | npm workspaces, oxlint, `tsc` type-checking |

## Prerequisites

- **Node.js 24+** — the server runs TypeScript natively (type stripping), no build step
- **npm 10+**
- **PostgreSQL** running on `localhost:5433` with a database named `ticket_management`

## Setup

```bash
# 1. Install every workspace
npm install

# 2. Create the env files from their templates, then fill in real values
cp server/.env.example server/.env   # DATABASE_URL, BETTER_AUTH_SECRET, admin seed
cp client/.env.example client/.env   # VITE_API_URL

# 3. Create the database schema
npm run db:migrate --workspace server

# 4. Seed the first admin account (reads ADMIN_EMAIL / ADMIN_PASSWORD from .env)
npm run db:seed --workspace server
```

Generate `BETTER_AUTH_SECRET` with `openssl rand -base64 32`.
There is **no public sign-up** (`disableSignUp: true`) — accounts are created by
seeding or by an admin, so step 4 is required before you can log in.

## Development

```bash
npm run dev:server   # Express API  → http://localhost:3000
npm run dev:client   # Vite dev server → http://localhost:5173
```

Run both. The client calls the server cross-origin, so the server enables CORS
for `http://localhost:5173` with `credentials: true` — the session cookie will
not be sent without it.

## Scripts

Run from the repo root:

| Script | Description |
| --- | --- |
| `npm run dev:server` | Run the API in watch mode (`node --watch`, native TS) |
| `npm run dev:client` | Run the Vite dev server |
| `npm run build:client` | Type-check + build the client |
| `npm run typecheck:server` | Type-check the server (`tsc --noEmit`) |
| `npm run lint --workspace client` | Lint the client (oxlint) |
| `npm run lint --workspace server` | Lint the server (oxlint) |
| `npm run db:migrate --workspace server` | Create / apply a Prisma migration |
| `npm run db:generate --workspace server` | Regenerate the Prisma client |
| `npm run db:studio --workspace server` | Open Prisma Studio |
| `npm run db:seed --workspace server` | Seed the admin account |

## API

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| `ALL` | `/api/auth/*` | — | better-auth handler (sign-in, sign-out, get-session, …) |
| `GET` | `/api/me` | session | The signed-in user (`id`, `email`, `name`, `role`) |
| `GET` | `/api/users` | `admin` | All users (`id`, `name`, `email`, `role`, `createdAt`) |
| `GET` | `/health` | — | Liveness check (the Playwright run waits on it) |

Unhandled errors funnel through one error-handling middleware at the bottom of
`server/src/index.ts`, which logs the error and returns `500 internal_error` —
so every error the API returns is JSON, and no route needs a `try/catch` merely
to produce a 500.

## Client routes

| Route | Access | Page |
| --- | --- | --- |
| `/login` | public | Email + password sign-in |
| `/` | signed in | Home |
| `/users` | `admin` only | Users — read-only table fed by `GET /api/users` |

Route protection is handled by `ProtectedRoute`, which takes an optional `role`.
This is a **UX guard only** — authorization is enforced server-side per endpoint.

## Structure

```
ticket-management/
├── client/          # React SPA — see client/CLAUDE.md
│   └── src/
│       ├── components/   # NavBar, ProtectedRoute, ErrorDialog, ui/ (shadcn)
│       ├── lib/          # better-auth client
│       └── pages/        # Login, Home, Users
├── server/          # Express API — see server/CLAUDE.md
│   ├── prisma/           # schema, migrations, seed
│   └── src/
│       ├── auth.ts       # better-auth config
│       ├── db.ts         # Prisma client
│       ├── index.ts      # Express app + routes
│       └── require-auth.ts   # session guard middleware
└── _resources/      # Planning docs + knowledge notes
```

## Data model

- **User** — `agent` | `admin` (a real Postgres enum; clients cannot set their own role)
- **Session / Account / Verification** — better-auth tables, DB-backed sessions
- **Ticket** — `subject`, `body`, `status` (`open` by default), timestamps.
  Standalone for now; relations to user, category and assignee come with the
  tickets phase.

## Status

- ✅ **Monorepo skeleton** — client + server run under npm workspaces
- ✅ **Server** — Prisma + PostgreSQL, better-auth (email/password, DB sessions,
  roles, admin seed), CORS for the SPA
- ✅ **Client** — Tailwind v4, React Router, better-auth client, shadcn/ui;
  Login + Home wired to the auth API (login → protected home → logout)
- ✅ **Role-based access** — admin-only `/users` route and nav link (client-side UX guard)
- ⏭️ **Next** — the tickets domain (schema + API + UI), and a real admin-only
  users list (`requireAdmin` + `GET /api/users`)
- 🔜 **Later** — knowledge base, AI features (auto-classify, summarize, suggest a
  reply with agent review)

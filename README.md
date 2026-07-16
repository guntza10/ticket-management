# Ticket Management

A full-stack ticket management app. Monorepo with npm workspaces.

## Structure

```
ticket-management/
├── client/   # React + TypeScript + Vite (SPA)
├── server/   # Express + TypeScript (API)
└── _resources/  # Project planning docs
```

## Prerequisites

- Node.js 24+ — the server runs TypeScript natively (type stripping), no build step
- npm 10+

## Setup

```bash
npm install   # installs both workspaces
```

## Development

```bash
npm run dev:server   # Express API on http://localhost:3000
npm run dev:client   # Vite dev server on http://localhost:5173
```

Health check: `GET http://localhost:3000/health`

## Scripts (root)

| Script | Description |
| --- | --- |
| `npm run dev:server` | Run the API in watch mode (`node --watch`, native TS) |
| `npm run dev:client` | Run the Vite dev server |
| `npm run build:client` | Type-check + build the client |
| `npm run typecheck:server` | Type-check the server |

## Status

Phase 1 — project skeleton (client + server). Database (PostgreSQL + Prisma),
Tailwind, and React Router are added in later steps per
`_resources/project/implementation-plan.md`.

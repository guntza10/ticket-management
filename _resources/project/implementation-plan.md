# Implementation Plan (Our Version)

Checklist tasks **mirror the course exactly** (`_resources/prototype/implementation-plan.md`)
so the build videos line up. Anything **we** add is pulled out as a separate
`[ours]` note under each phase — never mixed into the course's task lines.

Legend: 🔴 must-have · 🟡 important · 🟢 later

---

## Phase 1 — Project Setup 🔴

- [ ] Initialize monorepo structure (`/client`, `/server`)
- [ ] Set up Express server with TypeScript
- [ ] Set up React app with TypeScript
- [ ] Set up PostgreSQL database

> **[ours]** Also part of this phase (from our tech stack; the course adds these
> during the videos): **Prisma** + first migration · **Tailwind** · **React Router**
> · `.env` config + secrets (DB URL, Claude API key).

## Phase 2 — Authentication 🔴

- [ ] Create login page
- [ ] Implement login API endpoint
- [ ] Implement session-based authentication middleware
- [ ] Implement logout API endpoint
- [ ] Add route protection on the frontend (redirect to login if unauthenticated)

## Phase 3 — User Management 🔴

- [ ] Create user management page (admin only)
- [ ] Implement create agent API endpoint
- [ ] Implement list users API endpoint
- [ ] Implement edit user API endpoint
- [ ] Implement delete user API endpoint
- [ ] Add role-based access control (admin vs agent)

## Phase 4 — Ticket CRUD 🔴

- [ ] Implement create ticket API endpoint
- [ ] Implement list tickets API endpoint (with filtering by status and category, sorting)
- [ ] Implement get ticket API endpoint
- [ ] Implement update ticket API endpoint (change status, assign agent)
- [ ] Create ticket list page with filtering and sorting
- [ ] Create ticket detail page

> **[ours]** The create-ticket step uses a manual form as a stand-in for email
> until Phase 6 — so we can build/test everything without inbound email yet.

## Phase 5 — AI Features 🟡

- [ ] Set up Claude API integration
- [ ] Implement auto-classification endpoint (categorize incoming tickets)
- [ ] Implement AI summary endpoint (generate ticket summary)
- [ ] Implement AI suggested reply endpoint
- [ ] Build knowledge base structure and seed with initial content
- [ ] Integrate AI features into ticket detail page UI

> **[ours]** Add a human gate: the agent reviews/edits the AI draft and approves
> before sending. Model picks — MVP uses `claude-opus-4-8` for all jobs; later
> optimize classify/summarize → `claude-haiku-4-5`, keep reply drafting on
> Sonnet/Opus.

## Phase 6 — Email Integration 🟢

- [ ] Set up email provider (SendGrid/Mailgun)
- [ ] Implement inbound email webhook to create tickets
- [ ] Implement outbound email sending when an agent replies
- [ ] Handle email threading (replies linked to existing tickets)

> **[ours]** If inbound setup blocks progress, keep the Phase 4 manual form as the
> stand-in and come back to it.

## Phase 7 — Dashboard 🟢

- [ ] Create dashboard page with ticket overview stats (open, resolved, closed counts)
- [ ] Add tickets by category breakdown
- [ ] Add recent tickets list
- [ ] Add quick filters to navigate to filtered ticket list

## Phase 8 — Polish & Deployment 🟢

- [ ] Add input validation and error handling across all endpoints
- [ ] Add loading states and error states on the frontend
- [ ] Write Dockerfile for server and client
- [ ] Set up Docker Compose for local development
- [ ] Write deployment configuration

---

## [ours] Beyond v1 — Deferred roadmap
*Not part of the course's v1. Pulled from `requirements.md` so we don't forget.*

- [ ] Confidence-based auto-send (skip review when AI is confident)
- [ ] SLA / stale-ticket handling (age indicator + sort, notify, escalate)
- [ ] Edge cases: spam filtering, duplicate detection, reopen, auto-close
- [ ] Knowledge base management UI
- [ ] Metrics beyond the basic dashboard
- [ ] Learn from agent replies → new KB entries

---

## [ours] How to think about the order

```
Setup → Auth → User Mgmt → Ticket CRUD → AI → Email → Dashboard → Polish
```

- Foundations first (1–3): nothing works without the skeleton + login.
- Ticket CRUD (4) before AI (5): AI needs tickets to act on; the manual form lets
  us test AI without email.
- Email (6) after the core: it's the hardest integration and isn't needed to
  prove the flow works.
- Dashboard (7) later: stats need real tickets/statuses/categories first.

> **First milestone (thinnest working slice):** Phase 1 + 2 + a minimal slice of
> Phase 4 (create + view one ticket). Get *that* running end-to-end before going wide.

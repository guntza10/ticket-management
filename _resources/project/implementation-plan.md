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

- [x] Create user management page (admin only) — list, create, edit and delete,
      all behind `ProtectedRoute role="admin"`
- [x] Implement create agent API endpoint — `POST /api/users`, admin-only, role forced
      to `agent` server-side
- [x] Implement list users API endpoint
- [x] Implement edit user API endpoint — `PATCH /api/users/:id`, admin-only, a
      blank password leaves the existing one alone
- [x] Implement delete user API endpoint — `DELETE /api/users/:id`, admin-only,
      **soft delete**; admins are undeletable, and the deleted user is signed out and
      refused a new sign-in
- [x] Add role-based access control (admin vs agent) — `requireAdmin` (403);
      apply it to each new **admin-only** endpoint as it lands — narrowed 2026-11-08,
      because it read as an instruction to put `requireAdmin` on everything, and
      `/api/tickets` is work both roles do while the inbound webhook has no session
      at all

## Phase 4 — Ticket CRUD 🔴

- [x] Implement create ticket API endpoint — **it is the inbound-email webhook,
      `POST /api/webhooks/inbound-email`, not a `POST /api/tickets`.** The reference
      project has no such route and no manual create form; a ticket's only writer is
      the ingestion point. Guarded by a shared secret, not a session
- [ ] Implement list tickets API endpoint (with filtering by status and category, sorting)
- [ ] Implement get ticket API endpoint
- [ ] Implement update ticket API endpoint (change status, assign agent)
- [ ] Create ticket list page with filtering and sorting
- [ ] Create ticket detail page

> **[ours]** This note used to say the create-ticket step would use a manual form as a
> stand-in for email until Phase 6. **That was our guess and it was wrong** — corrected
> 2026-11-08 after reading the reference project's own commit for this step
> (`f76a78d Add the ability to receive tickets`). It builds the webhook here, in Phase 4,
> with a plain-JSON body and no mail provider: the endpoint waits for a provider rather
> than a form waiting for the endpoint. Phase 6 is then only the provider, the outbound
> half and real threading.
>
> **Consulting the reference project is a call *he* makes, not a planning step**
> (set 2026-11-10). The default is to design from this repo's own code and docs — an
> answer sheet turns designing into copying, and building the design judgment is the
> point of the exercise. He says when a step should follow the video, the way he did for
> the inbound-email webhook above.
>
> **When he does ask: read it by commit, not by its working tree.** Its history is one
> commit per video, so `git show <commit>` is what a step contains; the files on disk are
> the finished app, roughly fifteen videos further on.

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
- [x] Implement inbound email webhook to create tickets — **done in Phase 4**, where the
      reference project builds it. What is left here is the provider in front of it: a
      `multipart/form-data` parser, and a security policy instead of our shared header
      secret (Inbound Parse cannot send custom headers)
- [ ] Implement outbound email sending when an agent replies
- [ ] Handle email threading (replies linked to existing tickets)

> **[ours]** The webhook itself already exists (Phase 4). This phase is the provider, the
> outbound half, and replacing the subject-based duplicate guard with real `Message-ID` /
> `In-Reply-To` / `References` threading — which needs a `Reply` model and a `messageId`
> column, neither of which exists yet because nothing sends a message id today.

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

# Project Overview — AI-Powered Ticket Management System

A single-page recap of everything decided during planning. Read this first to
remember **what** we're building, **why**, and **how** — then jump into the build.

---

## 1. What & Why (the elevator pitch)

A support team for **students** gets hundreds of emails a day. Today, agents read,
classify, and reply to each one by hand — it's **slow**, and the canned-template
replies feel **robotic**.

We're building an **internal tool** that uses AI to **classify, draft, and route**
those emails, so students get **faster, more human-sounding** replies and agents
are freed up for the genuinely hard cases. A human always stays in control of what
actually gets sent.

> **Guiding principle:** the riskier or more complex the case, the more a human
> stays in control. *AI proposes, a human disposes.*

## 2. Who uses it

- **Admin** — owns the system (deployed with it). Can do everything an agent can,
  plus create/manage agents and configure the system.
- **Agent** — created by an admin. Views, manages, and replies to tickets.
- **Students** — do **not** log in. They only send support emails in.

## 3. How it works (the core flow)

```
Student email in
  → create ticket
  → AI classifies it (General / Technical / Refund) and finds a KB answer
        │
        ├── Known issue (in KB)  → AI drafts a human-friendly reply
        │                          → agent reviews → send
        │
        └── Complex (no KB match) → routed to the agent pool
                                   → AI summarizes + suggests a solution
                                   → agent writes/edits the reply → send
```

## 4. What we're building FIRST (v1 MVP)

Philosophy: ship the fewest features that solve the real problem; keep it simple
and easy to test. (Full detail in `mvp.md`.)

- **Features:** receive emails → create tickets · AI classification · KB-based
  reply generation · AI summaries · AI-suggested replies · ticket list (filter/
  sort) · ticket detail view · dashboard · user management (admin only)
- **Statuses (simple):** Open · Resolved · Closed
- **Categories:** General Question · Technical Question · Refund Request
- **Roles:** Admin · Agent

## 5. Tech stack (full detail in `tech-stack.md`)

Decoupled **SPA + REST API** (follows the course; not Next.js).

- **Frontend:** React + TypeScript · Tailwind · React Router
- **Backend:** Node + Express + TypeScript
- **Data:** PostgreSQL + Prisma
- **Auth:** email + password + database sessions (no social login)
- **AI:** Claude API (`@anthropic-ai/sdk`)
- **Email:** SendGrid / Mailgun (inbound webhook + outbound)
- **Deploy:** Docker + cloud

## 6. Build plan (full detail in `implementation-plan.md`)

Eight phases, ordered by dependency:

```
Setup → Auth → User Mgmt → Ticket CRUD → AI → Email → Dashboard → Polish/Deploy
```

**First milestone:** Setup + Auth + create/view one ticket, running end-to-end.

## 7. Deliberately deferred (post-v1)

Real gaps we found, postponed on purpose to keep v1 shippable (detail in
`requirements.md` and the "Beyond v1" section of `implementation-plan.md`):

- Richer statuses (Analysis by AI, Wait for checking, Wait for response)
- SLA / stale-ticket handling (age sort, notify, escalate to admin)
- Edge cases: spam filtering, duplicate-email detection, reopen on reply,
  auto-close timer, AI-failure fallback flag, edit-before-send guardrails

## 8. Planning artifacts & folder map

All four framework steps are **done**, plus an implementation plan:

| Step | What we did | Artifact |
| ---- | ----------- | -------- |
| 1. Define the scope | Problem / Solution / Features | `project-scope.md` |
| 2. Clarify the requirements | Roles, lifecycle, edge cases, data model | `requirements.md` |
| 3. Define the MVP | Cut v1 down to the essentials | `mvp.md` |
| 4. Choose the tech stack | Frameworks, DB, auth, AI, email | `tech-stack.md` |
| + Implementation plan | Break v1 into phases & tasks | `implementation-plan.md` |
| + Design notes | Extra thinking behind the above | `planning-notes.md` |

**Folder map:**
- `_resources/project/` — **our** work (this folder). The source of truth for our build.
- `_resources/prototype/` — the **course/instructor's** reference version. We follow
  its structure so the build videos line up.

---

**Where we are now:** planning complete (all 4 steps + implementation plan). Next
up is **Phase 1 — Project Setup**.

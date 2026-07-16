# Tech Stack (Our Version)

Step 4 of the framework. We follow the course's prototype stack
(`_resources/prototype/tech-stack.md`) as the base — same architecture so the
build videos apply — and add our own decisions + reasoning where we went deeper
(AI model selection, auth).

> **Base alignment:** architecture, frontend, backend, DB, ORM, email, and
> deployment match the course. The **AI model split** and the **auth reasoning**
> below are our additions.

---

## Architecture

**Decoupled SPA + REST API** — React frontend and Express backend are separate
apps that talk over HTTP. (Following the course; not a Next.js full-stack app.)

## Frontend

- React + TypeScript
- Tailwind CSS
- React Router

## Backend

- Node.js + Express + TypeScript

## Database

- PostgreSQL

## ORM

- Prisma

## AI — Claude (Anthropic, `@anthropic-ai/sdk`)

Our refinement: the three AI jobs don't all need the same model. Pick per job by
"how smart must this be?" vs "how cheap/fast?".

| Job | Model | Price (per 1M tok in/out) | Why |
| --- | --- | --- | --- |
| Classify (KB vs complex + category) | `claude-haiku-4-5` | $1 / $5 | Simple, high-volume → cheap + fast |
| Summarize problem for agents | `claude-haiku-4-5` (or `claude-sonnet-4-6`) | $1/$5 (or $3/$15) | Doesn't need top intelligence |
| Draft natural-sounding reply | `claude-sonnet-4-6` (or `claude-opus-4-8`) | $3/$15 (or $5/$25) | The hero task — quality/tone matter most (fixes the "robotic" pain point) |

> **MVP simplification:** start with `claude-opus-4-8` for everything (best
> quality, no model-juggling), then optimize cheap jobs down to Haiku later.
> Matches our "MVP first, optimize after" principle.

## Auth

Following the course: **email + password** login with **database sessions**.
No social login.

- **Authentication (AuthN):** email + password. No "Login with Google" — accounts
  are admin-issued (users can't self-register), so social login's main benefit
  (easy self-signup) doesn't apply, and admin keeps full control of agent accounts.
- **Session management:** server stores the session in PostgreSQL and sends a
  cookie. Lets admin revoke an agent's access instantly — fits an internal tool.
- **Authorization (AuthZ):** role-based — admin can manage agents + settings;
  agent can only view/manage tickets. (See roles in `requirements.md`.)

## Email

- SendGrid or Mailgun — outbound replies + inbound webhooks.

> ⚠️ Note: inbound email (receiving → webhook → create ticket) is the trickiest
> part to set up. The course may simplify this early (e.g. a form before real
> email). Revisit when we reach it.

## Deployment

- Docker + a cloud provider (AWS, Railway, Fly.io, etc.)

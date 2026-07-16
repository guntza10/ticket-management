# MVP — Version 1.0

**Philosophy:** ship the fewest features that actually solve the business problem,
keep it simple, and make it easy to test. Defer everything else to later versions.

This v1 scope matches the course's reference (`../prototype/project-scope.md`).

---

## In scope (v1)

### Features
- Receive support emails and create tickets
- Auto-generate human-friendly responses using a knowledge base
- Ticket list with filtering and sorting
- Ticket detail view
- AI-powered ticket classification
- AI summaries
- AI-suggested replies
- User management (admin only)
- Dashboard to view and manage all tickets

### Ticket statuses (simple)
- `Open`
- `Resolved`
- `Closed`

### Ticket categories
- General Question
- Technical Question
- Refund Request

### User roles
- **Admin** — deployed with the system; can create and manage agents.
- **Agent** — created by admin; can view and manage tickets.

---

## Deferred to later (post-v1)

Came out of our deeper analysis in `requirements.md` — real gaps, intentionally
postponed to keep v1 simple and shippable:

- Intermediate statuses (`Analysis by AI`, `Wait for checking`, `Wait for response`)
- SLA / stale-ticket handling (age indicator + sort, notify, escalate to admin)
- Edge cases: spam / non-support filtering, duplicate-email detection, reopen on
  student reply, auto-close timer
- AI-failure fallback flag, confidence display, and edit-before-send guardrails

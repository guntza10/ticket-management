# Requirements (Clarified)

Step 2 of the framework. Built by reviewing `project-scope.md` with an
engineer/product partner and clarifying gaps topic by topic.

> Note: this exploration went deeper than the v1 MVP. The simpler v1 lives in
> `mvp.md`; the richer behavior captured here is the roadmap for post-v1.

---

## 1. Users & Roles

- The system is an **internal staff tool**. Students do **not** log in — they
  only send support emails into the system.
- There are exactly **2 roles** (sufficient for this project's purpose):

  - **Admin** — owns the system (deployed together with it). Can do everything an
    agent can, plus create/manage agents and configure the system.
  - **Agent** — created by an admin. Views, manages, and replies to tickets.
    Cannot manage other users or change system settings.

- Permission matrix:

  | Capability                     | Admin | Agent |
  | ------------------------------ | :---: | :---: |
  | View / manage tickets          |   ✅   |   ✅   |
  | Reply to customers (students)  |   ✅   |   ✅   |
  | Create / delete / manage agents|   ✅   |   ❌   |
  | Configure system settings      |   ✅   |   ❌   |

---

## 2. Ticket Lifecycle / States

Complex tickets are **not** assigned to a specific agent — they go into a
**shared pool** that any agent can pick up.

### States

| State              | Meaning                                                        |
| ------------------ | -------------------------------------------------------------- |
| `New`              | Just arrived; nothing done yet.                                |
| `Analysis by AI`   | AI is classifying the email and/or drafting a reply.           |
| `Wait for checking`| AI has drafted a reply (KB match); waiting for an agent to review & send. |
| `Wait for response`| Needs an agent to write the reply — used for **complex** tickets AND for tickets where **AI analysis failed** (flagged `AI failed`). |
| `Resolved`         | A reply was sent to the student; still open to a follow-up.    |
| `Closed`           | Terminal; no further replies accepted.                         |

### Transitions

```
New
  → Analysis by AI
      ├── KB match found, reply drafted   → Wait for checking
      ├── complex / no KB match           → Wait for response
      └── AI error                        → Wait for response  (flag: "AI failed")

Wait for checking   → agent reviews & sends   → Resolved
Wait for response   → agent writes & sends     → Resolved

Resolved
  ├── student replies (reopen)                 → Wait for response
  ├── no reply for X days (auto-close)          → Closed
  └── agent closes manually                     → Closed
```

### Notes
- **Reopen mechanism:** incoming replies are matched to an existing ticket via a
  reference in the email (e.g. a ticket ID in the subject, or `In-Reply-To` /
  `References` headers). No match → create a new ticket.
- **`AI failed` is a flag, not a separate state** — failed tickets fall back to
  the normal human path (`Wait for response`) with a flag for visibility.
- *Resolved in step 3 (MVP):* v1 uses only the simple `Open` / `Resolved` /
  `Closed` statuses; the intermediate states, auto-close timer, and auto-reopen
  are deferred to post-v1 (see `mvp.md`).

---

## 3. Data Model (v1) — [ours]

> Proposed entities and key fields, derived from the scope + MVP + tech stack.
> **Reconcile with the course's actual Prisma schema during Phase 1** — treat this
> as our reference, not the final schema. v1 uses the **simple** statuses
> (`Open` / `Resolved` / `Closed`), not the richer lifecycle in section 2.

**User**
- `id`, `email` (unique), `passwordHash`, `role` (`admin` | `agent`), `name?`,
  `createdAt`, `updatedAt`

**Ticket**
- `id`, `subject`, `body` (the student's message), `customerEmail` (student's email)
- `status` (`Open` | `Resolved` | `Closed`)
- `category` (`General Question` | `Technical Question` | `Refund Request`)
- `assignedAgentId` → User (nullable — complex tickets sit in a shared pool)
- `aiSummary?`, `suggestedReply?` (AI-generated, nullable)
- `createdAt`, `updatedAt`

**Reply** — an agent's outbound reply on a ticket (recommended; enables threading)
- `id`, `ticketId` → Ticket, `authorId` → User (agent), `body`, `sentAt`

**KnowledgeBase** — the answers the AI matches against
- `id`, `title` (question), `content` (answer), `category?`, `createdAt`, `updatedAt`

**Session** — created/managed by the session store (e.g. `connect-pg-simple`),
not hand-modeled.

Notes:
- `status` and `category` map to Prisma **enums**.
- The `Reply` model keeps conversation history and supports email threading in
  Phase 6; if the course stores replies differently, follow the course.

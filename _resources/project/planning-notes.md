# Planning Notes (our own thinking — not from the course)

Scratchpad for ideas we worked out while planning. Kept here so `project-scope.md`
stays scope-only. Each note is tagged with the framework step it will feed into.

Framework: 1) Define the scope → 2) Clarify the requirements → 3) Define the MVP
→ 4) Choose the tech stack.

---

## Design principle → feeds step 2 (requirements) & build decisions

> The riskier or more complex the case, the more a human stays in control.
> *AI proposes, a human disposes.*

## User flow → feeds step 2 (clarify the requirements)

```
Email in
  → Receive + create ticket
  → Understand what the student needs
  → Classify (in KB / not in KB)
        │
        ├── Path A: in KB
        │     → Search KB → re-rank → pick best match
        │     → Score confidence it fully covers the issue
        │     → AI rewrites the answer in a natural tone
        │     → Agent reviews & approves → send
        │
        └── Path B: not in KB (complex)
              → AI summarizes problem + suggests a solution
              → Agent uses the suggestion OR writes their own reply
              → AI polishes the wording → send
```

## MVP draft → feeds step 3 (define the MVP)

> ✅ Finalized in `mvp.md`. Kept here only as the thinking trail.

Not final — revisit after step 2, since clarifying requirements may change what
belongs in the MVP.

- **MVP candidate:** intake → classify → KB search → AI draft → **agent approves
  before send** → ticket list / detail / dashboard
- **Later:** confidence-based auto-send · KB management UI · metrics dashboard ·
  learn from agent replies into new KB entries

## Out of scope (for now)

- Multiple languages
- Channels other than email (chat, LINE, etc.)

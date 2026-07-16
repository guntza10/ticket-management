# Framework Workflow — How to Plan a Software Project

A **reusable, project-agnostic** guide to the planning method used in this course.
Read this to remember *how the process works* and *how to start* — for this project
or any future one.

> This is about the **method**, not this project's content. For "what the ticket
> system is", read `project/OVERVIEW.md` instead.

---

## The big picture

Plan before you build. Do these five moves in order, each producing one document,
before writing any code:

```
1. Define the scope       →  project-scope.md
2. Clarify the requirements →  requirements.md
3. Define the MVP          →  mvp.md
4. Choose the tech stack   →  tech-stack.md
5. Implementation plan     →  implementation-plan.md
                              ↓
                            BUILD
```

Each step feeds the next — that's why the order matters. Don't jump ahead; a later
step is only as good as the ones before it.

---

## The steps

### 1. Define the scope
- **Goal:** state *what* you're building and *why*, at a high level.
- **Do:** write three things — **Problem** (the pain), **Solution** (the approach),
  **Features** (what the system does).
- **Output:** `project-scope.md`
- **Done when:** someone could read it and understand the project in a minute.

### 2. Clarify the requirements
- **Goal:** surface the details and gaps the scope glossed over.
- **Do:** go topic by topic — **user roles & permissions**, **lifecycle/states**,
  **edge cases & failure modes**, **data model**, **non-functional needs**
  (scale, speed, privacy). A great way: use an AI as a discussion partner that
  asks you clarifying questions one at a time.
- **Output:** `requirements.md`
- **Done when:** the "what happens if…" questions have answers.

### 3. Define the MVP
- **Goal:** cut v1 down to the smallest thing that delivers real value.
- **Do:** for each feature ask *"if I remove this, does it still solve the core
  problem?"* — keep it if no, defer it if yes. Split into **v1** vs **later**.
- **Output:** `mvp.md`
- **Done when:** v1 is small, shippable, and still solves the main problem.

### 4. Choose the tech stack
- **Goal:** pick the tools (language, framework, DB, auth, AI, hosting).
- **Do:** decide by fit + what you (or the course) will actually build on. If
  following a course, use its stack so the build steps line up.
- **Output:** `tech-stack.md`
- **Done when:** every part of the MVP has a tool assigned.

### 5. Create the implementation plan
- **Goal:** turn the MVP into an ordered list of small, buildable tasks.
- **Do:** break work into **small tasks**, group into **phases**, order by
  **dependency** (foundations first, hardest integrations last).
- **Output:** `implementation-plan.md`
- **Done when:** you could hand phase 1 to someone and they'd know what to do.

---

## The thinking toolkit (reusable at any step)

The techniques that make each step work — steal these whenever you're stuck:

- **Make it concrete.** Abstract questions freeze the brain. Ask *"if a human did
  this by hand, what would they do first?"* — then translate their steps into
  features/requirements.
- **One step at a time.** Don't try to see the whole system at once (that's what
  causes blank-page paralysis). Answer one small question, then the next.
- **At a fork, walk one path fully.** When work branches (e.g. simple vs complex
  case), finish one branch before starting the other.
- **Ask "what if it fails?"** For every happy path, find the failure modes
  (bad input, no match, nobody available) — that's where real requirements hide.
- **Weigh trade-offs.** No option is perfect. Ask *"gain what, lose what?"* and
  pick what fits the situation.
- **When stuck deciding, ask "it depends on…"** List the factors that would change
  your answer before forcing a choice.
- **Reframe when both options are bad.** If neither choice is good, invent a third
  that keeps the best of both instead of settling.
- **The MVP test.** *"If I remove this, does it still solve the core problem?"*
- **Order by dependency.** Build what nothing depends on first.
- **Follow the base, then layer your own.** If following a course, match its
  structure first; keep your own deeper ideas as clearly-marked notes so you
  don't drift from the lessons.

---

## Folder convention (this repo)

- `_resources/framework-workflow.md` — this file (the method; reusable).
- `_resources/project/` — our work: the five artifacts for *this* project.
- `_resources/prototype/` — the course/instructor's reference version.

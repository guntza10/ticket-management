# Client (React SPA)

React 19 + TypeScript + Vite 8 single-page app for the ticket-management portal.
Shared, monorepo-level rules live in [`../CLAUDE.md`](../CLAUDE.md).

## Stack

- **React 19** + **TypeScript** (Vite 8, `@vitejs/plugin-react`)
- **Tailwind v4** (CSS-first, `@tailwindcss/vite`)
- **shadcn/ui** (Radix + cva + `cn` + lucide-react)
- **React Router 8** — declarative mode (`BrowserRouter` + `<Routes>`)
- **react-hook-form + zod** (via `@hookform/resolvers/zod`) for forms
- **axios** + **TanStack Query** (`@tanstack/react-query`) for data fetching
- **TanStack Table v9** (`@tanstack/react-table`) for the ticket list's columns and its
  sortable header. **v9, not the v8 nearly every example online still shows:**
  `tableFeatures()` + `useTable()` + `<table.FlexRender>`, not `useReactTable()` +
  `flexRender()`. shadcn's own data-table docs are on v9 too
- **better-auth** React client (`better-auth/react`)
- **Vitest** + **React Testing Library** + `jest-dom` (component tests, jsdom)

## Commands (from repo root)

- `npm run dev:client` — Vite dev server → http://localhost:5173
- `npm run build:client` — `tsc -b && vite build`
- `npm run lint --workspace client` — oxlint
- `npm run test:client` — Vitest, one pass; `npm run test:watch --workspace client` to iterate

## Conventions

- **Path alias `@/` → `src/`.** In `tsconfig.json` + `tsconfig.app.json` (`paths` only —
  **no `baseUrl`**; TS 6 deprecates it and fails the build) and `vite.config.ts`
  (`resolve.alias` via `import.meta.dirname`). Both are needed: `tsc` reads the first to
  type-check, Vite the second to actually resolve the file, so setting one alone passes
  one gate and fails the other. Prefer `@/...` imports — **except between files inside
  the same feature, which name each other relatively** (`./CreateUserForm`); see
  **Where a new file goes**.
- **TypeScript:** `verbatimModuleSyntax` → use `import type` for type-only imports;
  `erasableSyntaxOnly` → no enums / parameter-properties.
- **Clean TypeScript is enforced, not optional.** `strict` + `noUncheckedIndexedAccess`
  (tsconfig), and oxlint runs `correctness`/`suspicious`/`perf` as errors plus
  `typescript/no-explicit-any`. A repo `PostToolUse` hook (`.claude/hooks/ts-check.sh`)
  runs oxlint + `tsc` on every `.ts`/`.tsx` edit and reports failures back — write it
  clean the first time (no `any`, no unused, prefer `const`).
- **Tailwind v4:** CSS-first (`@import "tailwindcss"` in `src/index.css`; no
  `tailwind.config.js`). Theme tokens (OKLCH, light/dark) live in `src/index.css`.
  **Always write full class names** — never build class strings dynamically (they get
  purged silently).
- **shadcn/ui:**
  - Vendored under `src/components/ui/` (generated — oxlint ignores this folder).
  - Add with `npx shadcn@latest add <name> -c client`.
  - **Do not restyle shadcn components.** Let them own their appearance; only add
    **layout/sizing** classes (`w-full`, `max-w-sm`, positioning). Use `variant`/`size`
    for looks — not custom color/border/padding overrides.
  - Signal field errors with `aria-invalid` (built-in destructive styling), not custom CSS.
  - **An icon-only button needs an `aria-label`,** and make it name the thing it acts
    on: `aria-label={`Edit ${user.name}`}`, not `"Edit"`. Without one the accessible
    name is empty and neither a screen reader nor a test can tell one row's button from
    another's. `PasswordInput`'s toggle is the same shape.
    Two consequences worth knowing before writing a locator: the label becomes part of
    the **cell's** accessible name, so Playwright's
    `getByRole("cell", { name: "Some Name" })` also matches the actions cell reading
    `Edit Some Name` — pass `exact: true`. And `Edit Probe` is a substring of
    `Edit Probe Edited`, so the triggers need it too. Testing Library matches a whole
    string and is unaffected.
  - **Forms are built from `field`, not `form`.** shadcn replaced the old
    `Form`/`FormField`/`FormItem`/`FormMessage` wrapper with **`Field`** in October 2025.
    In this project's `radix-nova` style `/r/styles/radix-nova/form.json` carries no
    files at all, so `shadcn add form` installs nothing and reports success. `field.tsx`
    is the component to reach for; adding it also pulled in `separator.tsx`, which
    `FieldSeparator` imports and nothing in this app uses yet. Note what `Field`
    does **not** do: it has no `useId`, no `htmlFor`, no `aria-invalid` and no
    `aria-describedby`. The retired `form.tsx` supplied all of that through context;
    the new one is markup only so it fits any form library, and **every documented
    example wires those by hand** — that absence is the design, not a gap to patch.
  - **`cn` comes from the `cn` package**, not a local `@/lib/utils` — shadcn 4.x
    generates components that way, so there is no local utils file to keep in sync.
    It is a compiled drop-in for `clsx` + `tailwind-merge`, which were removed with it.
    Don't "fix" a generated import back to `@/lib/utils`.
- **Loading states — three shapes, and only one of them is a skeleton:**
  - **Content that will fill a known layout** → `Skeleton` inside that layout.
    `UsersPage` renders the real table header plus skeleton rows, so the data replaces
    them without shifting anything. A skeleton whose shape doesn't match what arrives
    is a spinner with extra steps — match the real thing or don't bother.
  - **A button doing work** → keep the button, `disabled` + a present-tense label
    (`LoginPage`: "Signing in…"). Never swap a button for a skeleton.
  - **A sub-100ms transient before we even know what to render** → plain text, or
    nothing. `ProtectedRoute` waits out the session request this way; a skeleton there
    would flash and read as breakage.
- **Forms:** react-hook-form + a zod schema (`zodResolver`). One schema is the source of
  truth for both the rules and the type (`z.infer`). zod v4 → top-level `z.email()`.
  A form's schema is **not** the security boundary — the server re-validates, because
  anything reachable by fetch is reachable by curl. Validating here only saves a
  round-trip. **The schema itself is shared**: `CreateUserForm` imports
  `createUserSchema` from `core/schemas/users.ts`, the same file the API route and the
  seed script parse with, so there is nothing left to drift. Background, including
  `register` vs `Controller` and how `FieldError` decides what to render:
  `_resources/knowledge/forms-react-hook-form-and-field.md`.
- **Always pass `defaultValues` to `useForm`.** react-hook-form recommends it for the
  form as a whole, and these inputs are uncontrolled so they would read `""` off the DOM
  without it — but `isDirty`, `watch` and `reset` all compare against that object, so a
  form without it quietly cannot answer "has anything changed?". `EditUserForm` is where
  that stopped being theoretical: its `defaultValues` **are** the prefill, and its Save
  button is `disabled={isSubmitting || !isDirty}`, so the same object does both jobs.
  Drop it there and every freshly opened form counts as changed, inviting a write that
  stores the row exactly as it already was.
- **One field = `Field` + `FieldLabel` + the control + `FieldError`, inside a
  `FieldGroup`.** Written out per field, exactly the way shadcn's own Field docs write
  it, and **deliberately not wrapped in a shared field component.** A wrapper was built
  and reverted: it saved five lines a field and cost a render prop, an extra file, and a
  shape nothing written about shadcn describes. Matching the documented markup is worth
  the verbosity here, because it is the shape a tutorial, a Stack Overflow answer or a
  later look at the docs will all agree with. The general rule that decision came from
  is **When to extract a unit** in the root [`../CLAUDE.md`](../CLAUDE.md) — read it
  before pulling anything out of a page or a form.
  - **The wiring is explicit and that is the documented design.** `Field` and friends
    carry no `useId`, no `htmlFor`, no `aria-invalid` — they are markup only, so they fit
    react-hook-form, TanStack Form or Server Actions equally. So each field pairs `id`
    with `htmlFor` by hand, puts `aria-invalid` on the control, and `data-invalid` on the
    `Field` (which is what turns the label destructive alongside the message).
  - **`FieldError` has two entry points; use `errors`.** `errors={[error]}` takes
    react-hook-form's error *object* and digs out `.message` itself (several objects
    render as a deduplicated bullet list); `children` takes a plain string, and silently
    wins if both are passed. One spelling everywhere, `errors.root` included.
  - **No condition around `FieldError`.** It renders nothing when handed nothing, so
    `{errors.x && <FieldError…>}` only adds a branch. The docs do write that condition;
    skipping it is a small, deliberate difference.
  - **`role="alert"` comes from `FieldError`**, so a message is announced when it
    appears. `aria-describedby` is *not* wired — see the Known gaps table in the root
    `CLAUDE.md`. Every documented shadcn example omits it too; don't read its absence as
    something to go and fix without reading that row first.
  - **`!!error`, not `Boolean(error)` or `error ? true : false`.** The last of those is
    an oxlint error (`no-unneeded-ternary`). Between the first two the ecosystem is
    genuinely split — `no-implicit-coercion` is the rule that forbids `!!` — and this
    repo leaves that rule off, because shadcn's own generated `field.tsx` writes `!!`
    and would fail it on every regeneration.
  - **Checkbox, switch, radio: don't reach for this shape.** A checkbox or switch puts
    its label *after* the control and reads horizontally —
    `Field orientation="horizontal"`. A radio or checkbox group is one question over
    several controls, so the question is not a `<label for>` at all: `FieldSet` +
    `FieldLegend`, both already in `field.tsx`.
- **Dialogs that hold a form: controlled Root, form in its own component.** Radix
  unmounts `DialogContent` on close, so keeping the `useForm` call inside the child means
  every open starts blank with no `reset()` to remember, and yesterday's error cannot
  reappear. Keep `open` on the Root (success has to close it from inside); a
  `DialogTrigger` inside a controlled Root still works — it just calls `onOpenChange`.
  For an **edit** dialog the same unmount does more than start blank: the form's
  `defaultValues` are read on mount, so every open re-reads the row as it is *then*. A
  `useForm` that outlived a close would keep showing the row from before the last
  refetch and offer to save it back. `EditUserDialog.test.tsx` holds that down by
  opening, abandoning an edit, reopening, and by re-rendering with a changed `user`.
  One dialog is rendered **per row**, each holding its own `open` — the alternative, one
  dialog plus a "which row is being edited" state, needs the row remembered above the
  table and a null check at every read of it. Only the trigger button is mounted per
  row; Radix renders `DialogContent` only while open.
  `CreateUserDialog` + `CreateUserForm` are the pattern, and `CreateUserDialog.test.tsx`
  is what holds it in place: it opens, types, closes, reopens, and asserts both the draft
  and a 409's message are gone. Nothing else catches a regression here —
  `create-user.spec.ts` opens the dialog in three tests but never twice inside one, so
  moving the `useForm` call up into the dialog, or adding `forceMount`, would leave the
  whole E2E suite green.
- **A destructive action asks with `AlertDialog`, not `Dialog`.** It renders
  `role="alertdialog"` and forces a choice instead of allowing an idle dismissal.
  `DeleteUserDialog` is the pattern: a `Trash2` ghost trigger labelled
  `Delete ${user.name}`, a title naming the row, and a description that says what
  actually happens rather than the usual "this cannot be undone" — ours *can* be
  undone in the database, and what matters to the person is that the address stays
  taken. `AlertDialogAction` closes on click by default, so the confirm handler calls
  `event.preventDefault()`; without it the dialog disappears while the request is
  still unanswered, which is the only place the pending state is visible.
  On failure it **closes itself before** opening `ErrorDialog` — there is no field for
  "the delete failed" to land on, and two Radix portals open at once fight over one
  focus trap.
- **A soft-deleted row is shown, not hidden.** `GET /api/users` returns it on purpose,
  so the roster renders it muted with a `Deleted` badge **inside the name cell** and no
  action buttons. The badge and the missing buttons live in the name and actions column
  definitions in `features/users/components/columns.tsx`; the muting is a class on the
  `<TableRow>`, so it stays in `UsersTable` where the row is written. The badge gets no column of its own: a column means a header
  cell, a sixth skeleton cell and a `colSpan` bump, all to say something only some rows
  need to say. Note the cost it does have — the badge makes
  that cell's accessible name read `"Some Name Deleted"`, so specs locate a row by its
  **email** cell instead.
  - **That list used to end "and new counts in the test", which was false** until
    2026-11-02: every test counted `row`, never `cell`, so a sixth header with no
    sixth cell went green. The sentence was worse than wrong — it told the next reader
    a mistake would be caught. `UsersTable.test.tsx` now makes it true, and it is true
    the only way that lasts: **the three assertions compare against the rendered
    `columnheader` count rather than against `5`**, so they follow a column that is
    genuinely added and fail one that is half-added. Adding a `<TableHead>` with
    nothing else turns all three red.
- **The table is its own component, and the reason is that agreement.**
  `UsersTable` holds the headers, the empty row's `colSpan` and the skeleton cells —
  everything that has to agree on how many columns there are. Those three lived in
  `UsersPage` until 2026-11-02, so a new column meant editing two files with nothing
  saying when one was forgotten; since 2026-11-16 all three read
  `table.getAllColumns()`, so they cannot disagree at all. It
  takes `users`, `isPending` and, since 2026-11-21, the three pagination props
  (`pagination`, `onPaginationChange`, `rowCount`) as **props** rather than calling
  `useUsers()` itself:
  the page shows `error` above the Card, so it has to call the hook anyway, and the
  props are what let the three bodies be reached from a test with no faked request.
  The delete button is also hidden on **admin** rows. That is the UI half of a rule the
  server enforces with `403 admin_not_deletable`; hiding it is courtesy, the refusal is
  what counts — the same split as the admin-only NavLink.
  - **`features/tickets/` shipped both halves on day one** (2026-11-11) rather than
    waiting for a sweep to notice the collection half, which is the standing correction
    to the 2026-10-26 miss. `TicketsTable` + `TicketsTableRow`, same props shape, same
    reasons.
    **`TicketsTableRow` was then retired on 2026-11-13**, and not because the decision
    above was wrong — because TanStack Table keeps each cell's renderer in the column
    definition, so a row component and a `columns` array are two answers to one question.
    The row's three cases (a status as a word, a category as a word, an em dash for an
    unclassified ticket) moved into `TicketsTable.test.tsx` rather than being dropped;
    what was lost is reaching them with one prop instead of a one-element `tickets`
    array, which is a small price for the agreement below.
  - **Both tables use TanStack Table; neither uses a shared `DataTable` component.**
    The trigger the previous version of this bullet named — *"a third table, or the
    sorting step, whichever comes first"* — fired on 2026-11-13, and its two halves got
    different answers.
    **The library: adopted for both**, so the project has one way of building a table
    rather than two. The ticket list went first because it is what needed sorting;
    `UsersTable` followed on 2026-11-16 in a commit of its own, as a refactor with no
    behaviour change and **no sorting** — `userTableFeatures` registers no features
    beyond its column meta, so the sorting code is not even shipped on `/users`. The
    proof it was a refactor is that **not one assertion in `UsersTable.test.tsx` had to
    change**. `UsersTableRow` was deleted in the same move, for the same reason
    `TicketsTableRow` was, and its three cases moved into `UsersTable.test.tsx`.
    **A shared component: still refused**, on the test that always decided it: *must the
    copies change together?* They must not. A column added to the roster says nothing
    about the ticket list, and sorting arrived at one and not the other. The old
    reasoning that *"a hand-rolled `DataTable` would have to take a column-definition
    array — which is what TanStack Table is"* reads the other way round now: that is an
    argument for **using** TanStack, and once each table has its own `columns.tsx` what a
    wrapper would still share is a `<Table>`, a header loop and a body switch — markup
    that is cheaper read twice than learned once.
    `splitRows()` in the two table tests is the same copy twice and stays that way on the
    same reasoning; its home if a third appears is `src/test/`, beside `axios-error.ts`.
- **`api` carries a 401 interceptor, and it is the only thing watching our own API.**
  Better Auth's session store already refetches on window focus and nulls itself on a
  401, so `ProtectedRoute` sends someone to `/login` on the next reload or tab switch —
  do not re-implement that. What it cannot see is this axios instance: calls to
  `/api/users` never pass through Better Auth, so nothing there learns the server
  refused one. The interceptor covers exactly that gap, and three rules make it safe:
  **401 only** (403 means "signed in, not allowed" and must reach the caller intact),
  read `error.response?.status` (an aborted request has no `response`), and
  **rethrow** or every caller's `catch` receives `undefined`. It deliberately does not
  call `signOut()`: `api.ts` cannot import `auth-client.ts` without a runtime
  `ReferenceError` — ES imports hoist and `auth-client` reads `API_URL` at module
  scope — and a full page load rebuilds that store anyway.
- **Auth:** go through `src/lib/auth-client.ts` (`signIn` / `signOut` / `useSession`).
- **API calls:** use the `api` axios instance from `src/lib/api.ts` — never a bare
  `fetch`. It carries `baseURL` and `withCredentials: true`; the API is cross-origin, so
  a call without the session cookie answers 401, and setting that per call is what gets
  forgotten on one endpoint out of twenty. axios also rejects on 4xx/5xx where `fetch`
  resolves, so there is no `response.ok` check to write. `API_URL` is still exported
  because the auth client reads it — don't re-read `VITE_API_URL` anywhere else, or half
  the app can end up on a different server (`.env` gitignored, `.env.example` committed).
- **Data fetching:** `useQuery`, not `useState` + `useEffect`. The `queryClient` is
  created at module scope in `main.tsx` so the cache outlives any component. Forward the
  `signal` React Query passes the query function straight to axios — React Query aborts
  it on unmount, which is why dev shows the first request as cancelled (StrictMode runs
  effects twice). `queryKey` is the cache's identity, not a label: name the same key to
  invalidate after a mutation. Background: `_resources/knowledge/axios.md` and
  `tanstack-query.md`.
- **Writes: `useMutation`, and invalidate the key the list reads.** The call lives in a
  named hook, one per endpoint, in `features/<domain>/api/` — `useCreateUser` in
  `api/create-user.ts`, `useUpdateUser` in `api/update-user.ts`, `useUsers` in
  `api/get-users.ts` — so the write and the cache it refreshes sit together and the
  component is left holding markup. `DELETE` has `api/delete-user.ts` beside them —
  it takes the id as a hook argument like update, because a delete has no body at all.
  They stay **separate hooks, not one `useSaveUser` that branches**: create and edit
  take different payload types, because a create must carry a password and an edit must
  be able to leave it out, and one input type loose enough for both would throw away the
  guarantee the create path depends on (measured: merging them makes the create call
  need a cast or a second `parse`). It posts, then `onSuccess` **returns**
  `queryClient.invalidateQueries({ queryKey: userKeys.all() })` — returning it makes
  `mutateAsync` settle only after the roster has
  refetched, so the dialog closes onto a table that already holds the new row instead of
  racing it. Name a different key and the table keeps showing the roster from before.
  The `return` is guarded by *"waits for the roster to refetch before reporting success"*
  in `CreateUserForm.test.tsx`, which holds the refetch open and asserts the form has not
  reported success yet — nothing else catches it, because every other assertion sees both
  calls happen whichever order they run in.
- **There is no state-management library here, and that is a decision.** Split state in
  two before reaching for one:
  - **Server state** — the real copy lives in the database and someone else can change
    it without telling us (the roster, later the tickets). It goes stale, so it needs
    caching, refetching and loading/error states. **TanStack Query is that manager, and
    we already use it.** Its own docs put it plainly: *"For a vast majority of
    applications, the truly globally accessible client state that is left over after
    migrating all of your async code to TanStack Query is usually very tiny."*
  - **Client state** — exists only in this browser tab. Redux / Zustand / Jotai manage
    *this*, not the above. Ours today: each dialog's `open`, and what react-hook-form
    holds while a form is on screen. Nothing that has to travel.
  - **The ladder, stop at the first yes:** server state → TanStack Query · used in one
    place → `useState` · crosses one or two layers that all use it → props (where
    `EditUserDialog` sits) · crosses layers that *don't* use it → restructure with
    `children` · several unrelated components need it → **Context** · Context now hurts
    → **a store**. Note the last step: "shared in many places" argues for Context, not
    for a store. A store needs a second reason — re-renders that need selectors, update
    logic worth keeping in one place, reads from outside React, or devtools.
  - **The ticket list's whole question lives in the URL — the sort and all three
    filters.** `useTicketListQuery` (`features/tickets/hooks/`) reads `sortBy`,
    `sortOrder`, `search`, `status` and `category` out of `useSearchParams` and that is
    the page's only state of either kind; `TicketsPage` holds none at all. It was
    `useTicketSort` until 2026-11-19, and the rename is the point: a hook named for the
    sort that also decides what `?status=` does is a worse name than a longer one.
    Where the person is looking is not a detail of how the page is drawn — in the URL it
    survives a refresh, the back button undoes it, and the view is shareable as a link.
    A store does none of those.
    **Pagination joined it on 2026-11-21 and the hook now owns the whole question** —
    `page` is read and written like every other parameter, and the hook also hands back
    `pagination` / `onPaginationChange` in TanStack's 0-based `pageIndex` spelling, so
    that conversion happens here and in the footer's `+ 1` and nowhere else.
    Two rules came with it, and they are the interesting half. **`setFilters` and
    `onSortingChange` both force `page: 1`**, because page 3 of one question is not page
    3 of another — written in the two setters rather than in a `useEffect` on the query,
    which would also fire on the back button and make `?sortBy=status&page=3` an
    unreachable URL. And **`onPaginationChange` drops `next.pageSize`**: nothing can
    change it, so honouring it would write a size into the URL that the endpoint does
    not read. `/users` got its own copy of the same shape in
    `features/users/hooks/use-user-list-query.ts` — see the note there and in **Where a
    new file goes** about why it is a copy rather than a shared hook.
    Five details are load-bearing and none is obvious.
    **Every parameter read out of the URL needs `?? undefined`** — six of them now.
    zod's `.default()` fires on `undefined` and never on `null`, `.optional()` has the
    same gap, and `searchParams.get()` answers `null` for a parameter that is not there,
    so without it a URL carrying only *some* of these fails the parse and reverts to the
    unfiltered default. That partial URL is not an edge case: it is what the app itself
    writes, because `toSearchParams` leaves out whatever matches the default, so a click
    on Status produces exactly `?sortBy=status` and typing produces exactly `?search=…`.
    Found by mutation testing on 2026-11-14 — removing the `??` broke nothing until
    *"fills in the half of the sort the URL leaves out"* was written for it.
    **Be exact about what guards them, because it is not one test per `??`:** removing
    the one after a parameter breaks every URL that *omits* that parameter, so the test
    naming it is the one that survives. Measured 2026-11-19 — deleting `status`'s turns
    9 tests red across the hook's file and `TicketsPage.test.tsx`, including the
    search-only and category-only cases and **not** the status-only one.
    `safeParse(Object.fromEntries(searchParams))` removes the condition rather than
    guarding it, and was **tried on 2026-11-16 and reverted on 2026-11-17 by preference** —
    reading each parameter by name is the clearer of the two. Worth recording so it is not
    re-proposed as new, and because reverting it surfaced something bigger: it needs
    `DOM.Iterable` in `lib`, which `tsc` here does not demand only because `@types/node`
    leaks an iterable `URLSearchParams` into the client's program (own row in the root
    `CLAUDE.md` Known gaps).
    **`toSearchParams` takes the whole query and rebuilds the string**, which is what
    closed a landmine `clean-code-reviewer` flagged on 2026-11-16: it used to start from
    an empty `URLSearchParams` while being handed only the sort, so once filters existed
    a click on a header would have cleared the search box and both dropdowns. Rebuilding
    from a complete `TicketListQuery` removes the thing to remember — a parameter can
    only be dropped by being left out of that one function. `onSortingChange` and
    `setFilters` both spread over the current query for the same reason, and the two
    tests that hold it are *"keeps the filters when a header is clicked"* and *"keeps the
    sort when a filter changes"*; each is the only one that goes red for its own spread.
    And **a value equal to the server's default writes no parameter at all**, so
    `/tickets` stays `/tickets`.
    **`replace` is the caller's decision, not the hook's.** `setFilters` takes
    `{ replace?: boolean }` and passes it straight through. A debounced keystroke sends
    `replace: true` — typing is not a navigation, and without it every pause mid-word
    leaves a history entry, so leaving a search would take several presses of back. A
    dropdown and a header push. Proven the only way it can be, by trying to go back:
    MemoryRouter clamps `go(-1)` at the first entry, so "nothing moved" is the assertion.
    **`sorting` and `onSortingChange` travel together everywhere** — out of the hook,
    through `TicketsPage`, into `TicketsTable` — which `clean-code-reviewer` named as a
    pair wanting to be one type (2026-11-16). Two props is not worth a type, and the
    trigger named then was "the third pair, because filtering and pagination each arrive
    as the same shape and six props threaded through a page that uses none of them is the
    point at which passing the `table` instance, or `children`, costs less".
    **Filtering arrived on 2026-11-19 and that prediction was wrong about the shape.**
    The filters do not thread through to the table at all — they go to a *different*
    child, so the page passes 2 props to `TicketsFilters` and 4 to `TicketsTable` rather
    than 6 to one. Nothing was restructured. Kept here rather than deleted because the
    next person to read it should know the trigger has already fired once without biting;
    **pagination is the real test of it**, since a page number does go to the table.
    **Pagination arrived on 2026-11-21, the trigger fired properly this time, and the
    answer is still no — with the reasoning written down, because "no" twice in a row is
    only honest if it says what changed.** `TicketsTable` now takes **7** props
    (`tickets`, `isPending`, `sorting`, `onSortingChange`, `pagination`,
    `onPaginationChange`, `rowCount`) and `TicketsPage` reads none of the last five; it
    forwards them. `UsersTable` takes 5 the same way. Both Standards reviewers named it,
    one as the predicted clump and one as the prediction coming true.
    Three restructures were weighed:
    **Bundling the five into one `query` prop** is the cheap one and was refused as
    cosmetic: the page forwards exactly the same five values, in a bag. It answers the
    *name* of the smell and nothing the smell is about.
    **Passing the `table` instance** — what this bullet guessed in 2026-11-16 — is worse
    than it sounded: `useTable` would move into `TicketsPage`, which would then have to
    import `ticketColumns` and `ticketTableFeatures` out of the feature, so the page
    would know how the table is built in order to stop knowing what it renders. The
    column definitions and the instance belong in one place and that place is the
    feature.
    **The table calling `useTicketListQuery()` itself** is the one that actually removes
    the threading, and it is the one to do: the hook is in the same feature, it reads the
    URL rather than holding state, so two callers cannot disagree, and the page keeps its
    own call for the request. What declined it is the price *today*: the table's tests
    reach every one of those states through props — the sort, the page, the three bodies
    — and they are green and each proven able to fail. Rewriting them around a
    MemoryRouter and a URL, at the end of a change, buys the same behaviour and risks the
    one thing the change has: proof.
    **Trigger, and it is not renewable: the next prop either table gains** — row
    selection and the detail page's row link are both on the way. At that point do the
    third option as its own commit with no behaviour change, the way `UsersTable` moved
    to TanStack Table on 2026-11-16, so the test rewrite is the only thing in the diff.
  - **Never park server data in a store.** That is a second cache beside the one
    TanStack Query already keeps, and then nothing says which of the two is right.
- **Server errors from a mutation go through `setError`, not a second dialog.** A 409
  becomes `setError("email", …, { shouldFocus: true })`: it lands in the field-error
  markup that already exists, lights `aria-invalid` for free, moves the cursor to the
  field that has to change instead of leaving it on the submit button, and
  react-hook-form clears it on the next submit. Server errors and zod errors go through
  the same door, so they surface identically. Anything else becomes
  `setError("root", …)` above the footer. Stacking a dialog over a form someone has to
  correct hides the thing they came to fix, so
  `ErrorDialog` is for failures with no field to land on: a rejected sign-in, and a
  sign-out the server refused. Its `title` is a **required** prop — a default would have
  labelled NavBar's failed sign-*out* "Sign in failed", which is the one thing the
  heading exists to tell apart.
- **Read the `error` better-auth hands back; it never throws.** Every client call
  resolves with `{ data, error }`, so `await signOut()` on its own discards the only
  report that it failed. `NavBar` reads it and stays put, because a refused sign-out
  leaves the cookie alive and `/login` would bounce a still-signed-in visitor back to
  `/` — a click that looks like it did nothing. Default its `message` with **`||`, not
  `??`**: the field is `string | undefined`, so `""` is inside the type, and `??` would
  pass it straight through to a dialog that only opens on a non-empty message — which
  puts the silent click back. `NavBar.test.tsx` covers both the empty and the missing
  message for that reason.
- **Test mode:** `npm run dev:test` = `vite --mode test --port 5174 --strictPort`, which
  loads the committed `.env.test` (secret-free — just `VITE_API_URL=http://localhost:3001`).
  Mode-specific env files override `.env`, so this is how the Playwright run points the
  SPA at the test API instead of the dev one.
- **Component tests:** Vitest + Testing Library, co-located as `Thing.test.tsx` next
  to `Thing.tsx`. Config lives in the `test` block of `vite.config.ts`; `src/test/setup.ts`
  loads the `jest-dom` matchers and runs `cleanup` after each test (Vitest runs without
  `globals`, so Testing Library's own cleanup hook never installs itself).
  - **Query by role, the way a user finds things** — `getByRole("cell", { name })`, not a
    class or a `data-slot`. Assertions written against markup pass while the page is
    broken; `UsersPage.test.tsx` counts `role="row"` to prove the skeleton holds the
    table's shape.
  - **Mock the boundaries only.** Fake `@/lib/api` and `@/lib/auth-client` — the modules
    that reach a server. Keep `QueryClientProvider` and `MemoryRouter` real: a fake
    router proves nothing and costs the same.
  - **A fresh `QueryClient` per test, with `retry: false`.** The app's cache is
    module-scope on purpose; in a test that is a leak, where one test's rows answer the
    next test's query. Retries only delay the failure the test exists to read.
  - **Test what E2E cannot stage** — the empty list, the rejected request, the request
    still in flight. The seeded database always has users and the server does not fail on
    request, so those states have no other way to be proven. `ProtectedRoute`'s
    "Loading…" is the clearest case: in a browser it is gone in under 100ms and any
    assertion races the session request, but a faked `useSession` can hold it still.
    `NavBar.test.tsx` is the same story for a **refused sign-out**: the server will not
    reject one on demand, so a faked `signOut` is the only way to reach the branch.
  - **Assert where a redirect lands, not that nothing rendered.** `ProtectedRoute.test.tsx`
    wraps the subject in a small `<Routes>` table so `<Navigate>` arrives somewhere with
    readable text — otherwise a test cannot tell "sent home" from "sent to login".
- **Routing:** declarative; guard private routes with `ProtectedRoute`, which waits out
  `useSession().isPending` before redirecting (avoids bouncing a logged-in user).

## Structure

- `src/pages/` — route pages (`LoginPage`, `HomePage`, `UsersPage`, `TicketsPage`)
- `src/features/<domain>/` — everything that only one domain uses, e.g.
  `features/users/components/` (`CreateUserDialog`, `CreateUserForm`,
  `EditUserDialog`, `EditUserForm`, `DeleteUserDialog`, `UsersTable` plus its own
  `columns.tsx`) and `features/tickets/components/` (`TicketsTable` and
  `TicketsFilters`, each plus its own `columns.tsx` for the table).
  **Each `columns.tsx` holds that table's TanStack column definitions, the `features` it
  switches on, and whatever label maps only its cells read** — the `Deleted` badge and
  the edit/delete dialogs for users, the `Badge` variant per status for tickets. The two
  are deliberately not shared: a column added to the roster says nothing about the ticket
  list. Tickets has no dialogs at all, because a ticket's only writer is the
  inbound-email webhook.
  - **`features/tickets/labels.ts` is the one thing at a feature's root** (2026-11-19),
    holding `statusLabel` and `categoryLabel`. They were in `columns.tsx` until the
    filter dropdowns became a second reader of the same words: a copy beside the dropdown
    is a thing that must agree with the table and nothing would say when it stopped —
    rename a category and the two would disagree about one ticket. Neither consumer owns
    them, so neither folder is their home. **Keyed by the union, not built from the
    array**, so a new member fails to compile until somebody writes its words; built with
    `.map()` it would render as `refund_request` and nothing would complain.
    The `Badge` variant stayed in `columns.tsx` because it is a class, nothing asserts it,
    and the dropdowns do not draw badges.
  - **`useDebouncedSearch` — refused for now** (2026-11-19), raised by
    `clean-code-reviewer` and it genuinely scores: the draft, the timer, the latest-ref
    and the URL sync are ~25 lines that can each be wrong on their own (Q2), and the
    test file has already split itself along that line — six of its eight cases and the
    whole `Harness` aim at the search box alone (Q3). That is the same score
    `useTicketSort` used to open `hooks/` on 2026-11-13, so the precedent exists.
    What declined it is Q4 and the price of churn: one caller, and extracting now would
    rewrite a test file that is green and proven able to fail, at the end of a change
    where everything else is settled. **Trigger: a second debounced control, or
    pagination arriving at this toolbar** — either makes the timing logic something two
    things share rather than one component's detail.
    **Half that trigger has now been answered: pagination did not arrive at this
    toolbar** (2026-11-21). The page number went into the footer under the table, not
    into the filter bar, so nothing here gained a second debounced control and the
    refusal stands unchanged. What remains of the trigger is the first half — a second
    control that debounces.
  - **`TicketsFilters` owns the half-typed search term and nothing else** — the URL owns
    the filters. It scores on question 2 of **When to extract a unit** (a `draft`, a
    debounce timer, a sync back from the URL — all able to be wrong on their own) and
    question 3, not on question 4.
    Three details inside it are load-bearing. **The debounce lives in the event handler,
    not an effect**, because it reacts to a keystroke rather than keeping a value in sync
    — React's own line between the two — which also means it cannot fire on mount and
    cannot restart whenever a render recreates `onChange`.
    **It calls `onChange` through a ref**, and that is a real bug fixed rather than
    caution: `setFilters` upstream is rebuilt every render with that render's query baked
    in, so a copy captured 300ms earlier writes its patch over a stale query — choosing a
    status between the keystroke and the commit made the status disappear. Note that
    `setSearchParams`'s updater form does **not** fix it: that setter is itself rebuilt
    per render and hands the updater its own render's params. The guard is *"keeps a
    filter chosen while the search was still being typed"*; measured 2026-11-19, calling
    the prop instead of the ref turns that one test red and nothing else.
    **A dropdown is named by a real `<label htmlFor>` + `useId`, not `aria-label`** —
    the shape Radix's own docs use. `aria-label` outranks the trigger's content in the
    accessible-name computation, and that content is `SelectValue`, the words saying what
    is selected right now. The label is `sr-only` because the toolbar has no room for
    three visible ones. Honest limit: the test pins the accessible *name*, so the label
    cannot be dropped silently, but jsdom models the name computation rather than what a
    screen reader announces — it cannot show the value is now read out too.
    The "no filter" option's value is `"__any__"` rather than `"all"`, because Radix
    refuses `value=""` and "not a member of the enum" is the whole mechanism: the handler
    looks the chosen value up in the real array with `.find`, so anything not in it comes
    back `undefined`. Spelled with underscores so a future status called `all` could not
    collide with it.
- `src/components/` — components **two or more** features or pages use
  (`NavBar`, `ProtectedRoute`, `ErrorDialog`, `PasswordInput`, `TablePagination`);
  `src/components/ui/` — shadcn (generated)
  - **`TablePagination` is the one abstraction the two lists share** (2026-11-21), and it
    passes the test a shared `DataTable` fails: paging means the same thing on both
    lists, both read the same `PAGE_SIZE`, and a change to how a page is announced — the
    range, the labels, the disabled edges — is a change both should get. A column added
    to the roster still says nothing about the ticket list, which is why the tables stay
    apart and this does not.
    **It takes `table` *and* `pagination`, and the second prop is the interesting half.**
    Every *decision* comes off the instance (`getPageCount`, `getRowCount`,
    `getCanNextPage`, `nextPage`), so there is one mechanism rather than two — which is
    why the first version of this file, which took plain numbers and did the arithmetic
    itself, was replaced. But `Table_RowPagination` carries the methods and not the
    state, so reading `pageIndex` off the instance meant a hand-written fragment of v9's
    atom graph in the prop type, for two numbers. Worse, `table.atoms.pagination.get()`
    is documented as a non-subscribing snapshot for event handlers, which is the wrong
    read in a render path; it worked only because the state is controlled from the URL.
    A second prop says "this footer needs a page index and a page size" in one line, and
    both callers already hold exactly that value.
    **It knows nothing about the URL and nothing about either feature** — which is what
    lets `TablePagination.test.tsx` build a real table from `rowPaginationFeature` and
    assert the footer's own branches, while each table's test keeps the wiring claim.
- `src/features/<domain>/api/` — one file per endpoint, each exporting the hook the
  components call: `get-users.ts` (`useUsers(query)` + `UserRow` + `UserListResponse` —
  it takes the page query and returns `{ users, total }` since 2026-11-21, where it took
  no argument and returned the rows),
  `create-user.ts`, `update-user.ts`, `delete-user.ts`, and `query-key.ts` holding the
  `userKeys` factory all four name. `features/tickets/api/` holds `get-tickets.ts`
  (`useTickets` + `TicketRow`) and its own `query-key.ts` exporting `ticketKeys`; no
  mutation files yet, because nothing writes a ticket from the UI.
  **`get-tickets.ts` imported `TicketStatus` and `TicketCategory` from `core/` on
  2026-11-19 instead of hand-writing them**, the way it had since the feature existed.
  What moved the line was filtering: `?status=`/`?category=` are validated by the shared
  `ticketListQuerySchema`, so each enum gained a real reader per side, which is `core/`'s
  own test for belonging there — and the dropdowns need the list as a **value**, which a
  type cannot give. `UserRow` still hand-writes `role`, because nothing shared validates
  it. **Nothing still enforces that those literals match `schema.prisma`**; one copy
  instead of two is all that changed, and the gap stays recorded in the root `CLAUDE.md`.
  `TicketRow.id` is a **number**, unlike `UserRow.id`, because `Ticket.id` is an `Int`.
- **A feature's keys live in one `query-key.ts` object — a query factory** — which is
  the shape TanStack Query's own docs use (`all()`, `list()`, later `detail(id)`), and
  both features were converted to it on 2026-11-14. Two loose exports, a `SCREAMING_SNAKE`
  const for the prefix beside a `camelCase` function for the list, cannot be discovered
  from one another and read as two unrelated things; `userKeys.` lists every key the
  feature has.
  - **`list()` spreads `all()`, and that relationship is the whole mechanism.** The
    mutations invalidate `all()`; the readers read `list()`. React Query matches a key by
    prefix, so one invalidation clears every variant — every sort **and every page**, a
    `detail(id)` later — without a mutation being touched. Pagination is what made that
    stop being a nicety on the roster: a created account lands on the last page, so an
    invalidation that reached only the page on screen would leave every other page
    holding rows from before.
  - **It is guarded by a test, because nothing else could see it.** Before the split, the
    read key and the invalidated key were the same array and could not drift. Afterwards
    they are two values related only by prefix: measured on 2026-11-14, making `list()`
    stop spreading `all()` left **all 83 component specs green** while in a browser a
    created user would have left the table showing the roster from before.
    `api/query-key.test.ts` in each feature now closes that, asserted through a real
    `QueryClient` rather than by comparing array prefixes by hand — the rule under test is
    React Query's matching, not ours.
  - **Both list keys carry the whole query — the sort, the filters and the page** —
    because the server decides all three. `userKeys.list()` took no argument at all until
    2026-11-21; it takes `{ page }` now, for the same reason the ticket key has always
    carried its sort: page 2 is a different answer from page 1, so it has to be a
    different entry, or one cache row would serve both.
  - **A ticket list key carries the sort** (`["tickets", "list", { sortBy, sortOrder }]`),
    because the server decides the order, so each sort is a different answer and a
    different cache entry. The query object goes in as **one element** rather than spread
    into several: object key order does not affect the hash, array item order does.
  - **The `"list"` segment is there before `detail` exists**, deliberately. Without it a
    list key and a detail key are both two elements long — `["tickets", { sortBy }]`
    against `["tickets", 17]` — which still hash apart but leave no way to invalidate only
    the lists. Adding it later would change every cache key in flight.
  - **`queryOptions()` is deliberately not adopted yet.** It would bundle `queryFn` in
    beside the key, so the two could never be paired wrongly — but today each key and its
    fetcher already sit in one function in one file. **Trigger: the first mutation that
    calls `setQueryData`, or prefetching on hover** — the first time something outside
    `get-*.ts` needs the same pair.
  - `useTickets` also sets `placeholderData: keepPreviousData`, which is what makes a sort
    click look like a sort: without it the key changes, React Query has no data for the new
    one, and the table falls back to its skeleton for a round trip.
- `src/lib/` — `auth-client.ts`, `api.ts` (`API_URL` + the `api` axios instance)
- `src/test/` — test support, not tests: `setup.ts` (jest-dom matchers + per-test
  cleanup) and `axios-error.ts` (`axiosErrorWithStatus`, the rejection shape the app's
  `isAxiosError` branches actually recognise)

### Where a new file goes

Three layers, and imports only ever point **downward**:

```
pages/                  →  features/ · components/ · lib/
features/<domain>/      →  components/ · lib/   (not a page, not a sibling feature)
components/ lib/ test/  →  nothing above them
```

- **Start in the feature.** A component, a hook or a schema used by one domain lives in
  `features/<domain>/`, not in `components/`. It moves to `components/` the day a second
  feature or page actually imports it — the same "does something else call it yet?" test
  as **When to extract a unit** in the root [`../CLAUDE.md`](../CLAUDE.md), applied to
  folders instead of files.
- **Inside a feature, import relatively** (`./CreateUserForm`); leaving the feature uses
  `@/...`. The spelling therefore says whether the import left the folder, which is what
  lets one lint rule cover every feature added later with no new config: inside
  `src/features`, any `@/features/...` is by definition some *other* feature.
- **This is a deliberate deviation from bulletproof-react, picked with its cost in
  view.** That project's `project-standards.md` says the opposite — *"Absolute imports
  should always be configured and used… wherever you move the file, all the imports will
  remain intact"* — and keeps cross-feature imports out with `import/no-restricted-paths`
  zones carrying `except: ['./users']`, one zone per feature. oxlint has neither that
  rule nor an `except`, and two attempts to recreate it were tested: a glob negation
  (`**/features/!(users)/**`) is simply dead — it matched neither the own-feature nor the
  cross-feature import — while listing every other feature by name does work, which is
  bulletproof's shape and grows with every pair of features. The relative convention was
  chosen over that because of how each one fails: forget the convention and oxlint says
  so with a message naming the fix, whereas forgetting to add a zone for a new feature
  leaves it silently unguarded. Note that this cuts against the reasoning that retired
  `FormField` (match the documented shape) — the difference is that a missing lint zone
  cannot be noticed by reading the code, and a wrongly-spelled import can.
- **`features/<domain>/api/` holds the server calls; `types/` and `stores/` are still
  not created until something goes in them.** `features/tickets/hooks/` was created on
  2026-11-13 by that same rule, once `useTicketSort` existed: it owns logic that can be
  wrong on its own and a test aims straight at it, which is two of the five questions in
  the root [`../CLAUDE.md`](../CLAUDE.md) answered yes. **`features/users/hooks/` was
  created on 2026-11-21 by the same rule**, once `useUserListQuery` existed — and it is
  the weaker of the two cases, which is worth saying: the hook owns one parameter and no
  reset rule, so what earns it the folder is having a home for `?page=` at all rather
  than logic a test aims at. The tests that reach it are `UsersPage.test.tsx`'s two URL
  cases, not a file of its own. `api/` was created on 2026-10-23, by
  decision, once `PATCH` made it three endpoints — `get-users.ts`, `create-user.ts`,
  `update-user.ts` plus the shared `query-key.ts`. The shape is bulletproof-react's:
  one file per endpoint, named for it.
  Worth being precise about *why*, because it is not the "second caller" rule — each
  hook still has exactly one caller. It is the other rule, from **Folder structure** in
  the root [`../CLAUDE.md`](../CLAUDE.md): where a file *lives* is the cheap half of a
  convention, so there is little to win by guessing early and little to lose by moving
  late. What actually forced it was `UserRow`, which described the feature's data from
  inside `pages/UsersPage.tsx` — a feature may not import from `pages/`, so the edit
  form had to restate the three fields it needed. With the type in `api/get-users.ts`
  that becomes `Pick<UserRow, "id" | "name" | "email">`, and the roster's shape reaches
  the form instead of drifting past it.
- **`useUserListQuery` is a copy of `useTicketListQuery`'s shape, deliberately**
  (2026-11-21). The two read `?page=`, build a `pagination`, resolve TanStack's updater
  and rebuild the URL the same way — about fifteen lines of shape. They are kept apart on
  the rule that always decides it here: **must the copies change together?** They must
  not. The ticket hook owns a sort, three filters and the `page: 1` reset those two
  setters need; the roster hook owns one parameter and explicitly has no reset, because
  nothing on `/users` narrows the list. A filter or a sort arriving at one list says
  nothing about the other — the same test that refused a shared `DataTable`. A generic
  hook would also need the schema *and* a "write the rest of the query" callback injected,
  because `toSearchParams` differs in five of its six lines: a guessed API for two
  callers.
  **What genuinely is one rule is the 1-based URL ↔ 0-based `pageIndex` conversion**,
  which now appears four times and has to agree with the server's `(page - 1) * PAGE_SIZE`.
  Today all four are identical and `PAGE_SIZE` is already shared, so there is nothing to
  drift. **Trigger: a third list, or the roster growing a search box** — at that point the
  reset rule becomes real logic in two places rather than shape, and a `usePageSearchParam`
  in `lib/` would earn its API from three callers' evidence instead of a guess.
- **The direction is a hard gate, not a guideline.** `.oxlintrc.json` has two
  `overrides` zones running `no-restricted-imports`: one stops `src/features/**` from
  importing another feature or a page, the other stops `src/components/**`, `src/lib/**`
  and `src/test/**` from importing either. oxlint has no `import/no-restricted-paths`,
  which is why it is spelled this way.
- **A new feature needs no config change at all.** Both zones are globs over
  `**/features/**`, so `features/tickets/` was covered the moment the folder existed —
  checked when it was added, so nobody goes hunting for a step that is not there.
- **The patterns read `**/features/**`, not `@/features/**`, and the leading `**` is
  load-bearing.** Written against the alias alone, the rule let
  `../features/users/components/CreateUserDialog` through from `src/components/` — a
  wrong direction spelled relatively is still a wrong direction, and the alias-only
  version only ever caught the polite way of writing it. Six spellings were proven to
  go red: shared → feature and shared → page, each as alias and as relative path;
  feature → page; feature → another feature by alias.
- **One case is deliberately not caught:** a feature reaching sideways by relative
  path, `../../tickets/components/TicketTable`. A glob that matches it (`../*/**`) also
  matches `../../../../../core/schemas/users.ts`, because `*` matches `..` — tested, and
  it turned the legitimate `core/` import red. Left open because `@/features/...` is how
  anyone would actually write a cross-feature import, and that spelling is caught.

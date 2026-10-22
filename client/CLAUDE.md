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
  (`resolve.alias` via `import.meta.dirname`). Prefer `@/...` imports.
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
  form without it quietly cannot answer "has anything changed?". The edit-user form will
  want exactly that.
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
  `CreateUserDialog` + `CreateUserForm` are the pattern.
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
  named hook next to the component (`useCreateUser` in `CreateUserForm.tsx`) so the
  write and the cache it refreshes sit together, away from the markup; edit and delete
  get siblings of it. It posts, then `onSuccess` **returns**
  `queryClient.invalidateQueries({ queryKey: ["users"] })` — returning it makes
  `mutateAsync` settle only after the roster has
  refetched, so the dialog closes onto a table that already holds the new row instead of
  racing it. Name a different key and the table keeps showing the roster from before.
  The `return` is guarded by *"waits for the roster to refetch before reporting success"*
  in `CreateUserForm.test.tsx`, which holds the refetch open and asserts the form has not
  reported success yet — nothing else catches it, because every other assertion sees both
  calls happen whichever order they run in.
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

- `src/pages/` — route pages (`LoginPage`, `HomePage`, `UsersPage`)
- `src/features/<domain>/` — everything that only one domain uses, e.g.
  `features/users/components/` (`CreateUserDialog`, `CreateUserForm`)
- `src/components/` — components **two or more** features or pages use
  (`NavBar`, `ProtectedRoute`, `ErrorDialog`, `PasswordInput`);
  `src/components/ui/` — shadcn (generated)
- `src/lib/` — `auth-client.ts`, `api.ts` (`API_URL` + the `api` axios instance)
- `src/test/setup.ts` — Vitest setup (jest-dom matchers + per-test cleanup)

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
- **Inside a feature, import relatively** (`./CreateUserForm`). Crossing a layer uses
  `@/...`. So the spelling of an import says whether it crossed a boundary, and it is
  what lets one lint rule cover every feature added later without new config.
- **`features/<domain>/api/`, `hooks/`, `types/` are not created until something goes in
  them.** `useCreateUser` is still inside `CreateUserForm.tsx` on purpose; it moves to
  `features/users/api/` when `PATCH` and `DELETE` need the same `["users"]` key.
- **The direction is a hard gate, not a guideline.** `.oxlintrc.json` has two
  `overrides` zones running `no-restricted-imports`: one forbids `features/**` from
  importing `@/features/**` (another feature) or `@/pages/**`, the other forbids
  `components/**`, `lib/**` and `test/**` from importing either. oxlint has no
  `import/no-restricted-paths`, which is why it is spelled this way. Both zones were
  proven to fire by writing a bad import and watching `oxlint` go red.

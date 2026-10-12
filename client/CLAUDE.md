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
  - **Assert where a redirect lands, not that nothing rendered.** `ProtectedRoute.test.tsx`
    wraps the subject in a small `<Routes>` table so `<Navigate>` arrives somewhere with
    readable text — otherwise a test cannot tell "sent home" from "sent to login".
- **Routing:** declarative; guard private routes with `ProtectedRoute`, which waits out
  `useSession().isPending` before redirecting (avoids bouncing a logged-in user).

## Structure

- `src/pages/` — route pages (`LoginPage`, `HomePage`, `UsersPage`)
- `src/components/` — app components; `src/components/ui/` — shadcn (generated)
- `src/lib/` — `auth-client.ts`, `api.ts` (`API_URL` + the `api` axios instance)
- `src/test/setup.ts` — Vitest setup (jest-dom matchers + per-test cleanup)

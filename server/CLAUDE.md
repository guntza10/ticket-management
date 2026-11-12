# Server (Express API)

Express 5 + TypeScript API on Node 24. Shared, monorepo-level rules live in
[`../CLAUDE.md`](../CLAUDE.md).

## Stack

- **Express 5** + **TypeScript**, run by **Node 24 natively** (type stripping — no build)
- **Prisma 7** + `@prisma/adapter-pg` → **PostgreSQL**
- **better-auth** (email/password, DB-backed sessions)

## Commands

- `npm run dev:server` — `node --watch` → http://localhost:3000
- `npm run typecheck:server` — `tsc --noEmit`
- `npm run db:generate | db:migrate | db:studio | db:seed --workspace server`
- `npm run db:reseed:tickets --workspace server` — sample tickets for the **dev** DB
  only. `reseed`, not `seed`: unlike `prisma/seed.ts` it **deletes every ticket** first,
  so re-running gives the same six rows instead of a growing pile.
- Test-DB variants: `start:test`, `db:migrate:test`, `db:seed:test`, `db:truncate:test`,
  `db:reset:test`

## Runtime & TypeScript

- Node 24 runs `.ts` directly — **do not add `tsx` or a build step.** Dev uses `node --watch`.
- `tsconfig.json` is type-check-only (Node ignores it at runtime); `erasableSyntaxOnly`
  is on → **no enums / parameter-properties / decorators** in server code.
- **Clean TypeScript is enforced:** `strict` + `noUncheckedIndexedAccess` (tsconfig), and
  oxlint runs `correctness`/`suspicious`/`perf` as errors plus `typescript/no-explicit-any`.
  A repo `PostToolUse` hook (`.claude/hooks/ts-check.sh`) lint/typechecks every `.ts` edit.
  Run `npm run lint --workspace server` alongside `typecheck`.

## Auth (better-auth)

- Config in `src/auth.ts`; handler mounted at `/api/auth/*` in `src/index.ts`
  **before `express.json()`** (it reads the raw body — JSON parsing above it hangs calls).
- **CORS** (`cors` middleware: origin `http://localhost:5173`, `credentials: true`) **and**
  **`trustedOrigins`** are both required for the cross-origin SPA — CORS is the browser
  gate, `trustedOrigins` is better-auth's CSRF gate. They are separate.
- `disableSignUp: true` — internal portal, no public registration.
- **`role`** is a Prisma enum (`agent`/`admin`) exposed via `additionalFields` with
  `input: false` (clients can't set their own role; seeding/admin assigns it).
- Seed an admin with `npm run db:seed --workspace server` (reads `ADMIN_EMAIL` /
  `ADMIN_PASSWORD` from `.env`).

## Module layout

- **An API resource is a folder, not a layer.** Everything about `/api/users` — its
  router and the logic behind it — lives in `src/users/`. The alternative (a `routes/`
  folder beside a `services/` folder) scatters one feature across several directories,
  which is felt the moment a change touches more than the route. `src/tickets/` follows
  the same shape.
  - **The folder follows the resource; the URL follows the caller.** The inbound-email
    webhook is mounted at `/api/webhooks/inbound-email` but lives in
    `src/tickets/inbound-email.routes.ts`, because a ticket is what it writes. A
    `src/webhooks/` folder would have had to import `src/tickets/` on its first day,
    which the import rule below forbids outright — so the mismatch between folder and
    URL is the rule working, not a slip. The reference project puts it in
    `src/routes/webhooks.ts`, which it can because it has no such rule.
  - **The webhook's guard is on the router** (`router.use(requireWebhookSecret)`), the same
  shape `users.routes.ts` uses, and for a sharper reason: if a second route under this
  mount were added without the guard there is no session layer behind it to catch the
  omission, which `/api/users` always has.
- **`src/tickets/` holds two routers, and the split follows the door, not the file
    size.** `inbound-email.routes.ts` and `tickets.routes.ts` describe the same resource
    but sit behind different URLs and answer different questions at the door —
    "do you know the shared secret?" against "is there a session?". One
    `router.use` cannot ask both, so a single file would have to repeat a guard per
    route, and a route added later would inherit whichever one happened to be nearest.
    That is the trigger for a second file here: **two guards, not two hundred lines.**
    (This bullet read "`src/tickets/` is one file on purpose" until `GET /api/tickets`
    arrived on 2026-11-11.)
    Still no `create-ticket.ts`: `create-user.ts` earned its own file because
    `prisma/seed.ts` is a second caller, and nothing is a second caller here. Split the
    pure helpers (`stripSubjectPrefixes`, the duplicate-guard decision) out the day
    `server/` gets a test runner, because that is the day a test could aim at them
    without HTTP.
- **`index.ts` holds wiring, not routes:** middleware order, mounts, the error handler,
  `listen`. Two handlers are left in it. `/health` stays: it is **liveness** — it answers
  from the process alone, which is what `playwright.config.ts` polls before a run and
  what a deployment healthcheck wants. A **readiness** check (one that queries Postgres,
  so a server with a dead database stops claiming to be healthy) belongs with the
  deployment work; adding it now would also make an E2E run fail for a reason no test is
  about. `/api/me` is scaffolding that only the specs use — see **Authorization**.
  `GET /` was removed on 2026-11-09: it answered a fixed string and nothing, in the app
  or in the suite, ever called it.
- **Imports only ever point downward, and right now nothing but this bullet says so.**
  `index.ts` may import a module; a module (`users/`) may import the shared files at
  `src/` root (`db.ts`, `auth.ts`, `require-*.ts`) and `core/`; those shared files may
  import neither a module nor `index.ts`, and **one module may not import another** —
  anything two modules need moves down to `src/` root or `core/`. Every import in
  `src/` already obeys all three; the point of writing it down is the day `tickets/`
  arrives and reaching into `users/create-user.ts` looks like the shortest path.
  The client enforces the same three with oxlint (**Where a new file goes** in
  [`../client/CLAUDE.md`](../client/CLAUDE.md)); this side cannot yet, because oxlint
  has no `import/no-restricted-paths` and the server's imports are all relative, so a
  glob cannot tell a sideways `../tickets/create-ticket.ts` from a legitimate
  `../generated/prisma/client.ts` — and with one module there is no second name to
  forbid. **Decided 2026-11-08, when `tickets/` arrived: the two expressible zones are
  spelled as `no-restricted-imports` overrides in `.oxlintrc.json`,** and the third stays
  prose. A Node `imports` alias was rejected — its targets must resolve *inside* the
  package and `core/` is deliberately a sibling outside `server/`, so the three-`../`
  import most likely to be mis-spelled could not be aliased at all: a repo-wide rewrite
  that leaves the riskiest spelling untouched.
  - Zone 1 names the module folders rather than globbing `./*/**`, because `db.ts`
    legitimately imports `./generated/prisma/client.ts`. It carries
    `excludeFiles: ["src/index.ts"]`, since `index.ts` importing a router *is* the
    wiring. Adding a module means adding its name here — the one maintenance cost.
  - Zone 2 stops a module importing `index.ts`.
  - **Zone 3 — one module may not import another — is still only this paragraph.** The
    glob that catches `../users/create-user.ts` from `src/tickets/` is `../*/**`, and
    `*` matches `..`, so it also catches the legitimate `../../../core/schemas/users.ts`
    (the client proved exactly this). The concrete temptation to resist is `tickets/`
    reaching for `users/create-user.ts`; the answer is to move what it needs down to
    `src/` root. Checked by hand with `grep -rn "\.\./users/" server/src/tickets/`.
- **The path prefix lives at the mount**, so `app.use("/api/users", usersRouter)` pairs
  with `router.get("/")`. A rename then touches one line instead of every route.
- **Guards go on the router when the whole resource shares them.** `users.routes.ts`
  calls `router.use(requireAuth, requireAdmin)` once rather than repeating the pair on
  each route: every route under `/api/users` is admin-only, and the mistake that ships
  is a new route added without the guards, not one that needed to opt out. Put them on
  the individual route only when they genuinely differ between routes.

## Authorization

### Two kinds of caller, two kinds of authentication

`requireAuth` asks **"is there a session?"** — a question a mail provider can never
answer, because it holds no cookie and never will. So `/api/webhooks/inbound-email` is
guarded by **`require-webhook-secret.ts`** instead, which asks the only question that
applies to a machine: *do you know the secret we share with it?* Same resource, different
question, different middleware — the same split as `requireAuth` versus `requireAdmin`.
Nobody should "fix" that route by adding `requireAuth`; it would refuse every delivery.

- **The secret is read at module load with a throw**, like `BETTER_AUTH_SECRET` in
  `auth.ts` and `DATABASE_URL` in `db.ts`. The reference project warns and keeps going,
  then answers 500 to every delivery — a deploy that forgot the variable looks healthy
  while silently dropping mail.
- **Header only (`x-webhook-secret`), never a query parameter.** The reference project
  also reads `?secret=`, which puts a credential into access logs, proxy logs and error
  reports. Nothing outside this repo calls the route yet, so header-only costs nothing —
  and it will not have to be undone: SendGrid's Inbound Parse cannot send a custom header
  at all, and the answer there is one of its security policies (ECDSA signature
  verification, or OAuth with an `Authorization: Bearer` token), not a query string.
- **Compared with `crypto.timingSafeEqual`**, after a length check because it throws on a
  length mismatch. Be honest about its worth against *timing*: **no test can tell it from
  `!==`**, and over a network jitter swamps the difference. It is four lines and the right
  habit there.
  Its *correctness*, though, is now guarded, and it was not until 2026-11-10. Every wrong
  secret any spec sent was a different length, so the length comparison short-circuited
  and the byte comparison never ran once in the whole suite — measured: replacing it with
  `timingSafeEqual(providedSecret, providedSecret)`, which accepts any secret of the right
  length, left 21 of 22 specs green. *"is 401 for a wrong secret of exactly the same
  length"* is
  the one that fails, and it is the only reason that hole is closed.
- **A duplicated header is not an array.** Node joins repeated values with `", "` (only
  `set-cookie` is ever an array), so `typeof header !== "string"` catches the header
  being **absent**, and a doubled header is refused on length. The comment here claimed
  the opposite until 2026-11-10; both paths now have a spec.
- **A refusal is logged, the value sent is not.** Without any log, a caller can guess at
  this secret indefinitely and nothing on our side would show it had happened — there is
  no rate limit in front of it either.

- Two separate guards, mounted in that order: `requireAuth` (is there a session? no → **401**)
  then `requireAdmin` (is the role `admin`? no → **403**). Authentication and authorization
  are different questions, so they get different middleware and different status codes —
  401 tells a client to sign in, which would never fix an agent hitting an admin route.
- `requireAdmin` reads `res.locals.session` and therefore **only works mounted after
  `requireAuth`**. `require-auth.ts` augments `Express.Locals` so that session is typed
  (without it every `res.locals.session` is `any`).
- **Endpoints returning user data always `select` an allow-list of fields.** A bare
  `findMany()` ships every column the table happens to have, including whatever the next
  migration adds. That list is **one constant per *answer shape*** — not one per resource. For users
  that is a single exported constant, `PUBLIC_USER_FIELDS` in `users/create-user.ts`,
  which all four verbs import, so a column added to it reaches every answer at once:
  GET, POST, PATCH and DELETE all answer one user in the same shape, and two hand-kept
  copies of that list would drift. Tickets have **two**, because a list and the
  webhook's answer are deliberately different shapes — see **Tickets (the list)**. `deletedAt` is in the list because the
  roster deliberately returns deleted rows, so the client can tell which ones they are.
  Nobody writes a `select` of their own; the two that existed were hand-kept
  copies until 2026-10-22, with a comment claiming they were shared. A plain object is
  enough, no `as const` or `satisfies`: Prisma still narrows the result type from it,
  so reading a field that was not selected is a type error.
  The `e2e/users-api*.spec.ts` files assert the exact key set on every row of every
  answer, which is the check that survives someone reintroducing a second copy.

## Creating accounts

- **`src/users/create-user.ts` owns the rows, and `prisma/seed.ts` calls it too.**
  An account is a `user` row *plus* a credential `account` row, and the two have to
  agree on
  `providerId: "credential"`, on `accountId` being the user's own id, and on the hasher.
  **That provider id is an exported const, `CREDENTIAL_PROVIDER_ID`**, since
  2026-10-23: it was a literal while this file was its only writer, but `update-user.ts`
  now *reads* account rows by it, and a reader and a writer disagreeing on that string
  does not throw — the filter matches nothing, `updateMany` answers `count: 0`, and a
  perfectly healthy row answers 500.
  Get any of those wrong and the account is created successfully and can simply never
  sign in — a failure with no error attached. One function means the seed and the
  endpoint cannot drift into that quietly.
- **Hash through `await auth.$context` → `ctx.password.hash`**, not the exported
  `hashPassword` from `better-auth/crypto`. They are the same function today, but
  sign-in verifies with whatever `emailAndPassword.password.hash` resolves to, so the
  config-aware one is the only one that stays correct if that is ever customised.
- **The email is lowercased by the schema, and that is correctness.** `/sign-in/email`
  looks a user up by `email.toLowerCase()`, and `@@unique([email])` compares bytes — so
  an address stored with a capital belongs to an account nobody can sign in to, sitting
  beside the lowercase one instead of being rejected as a duplicate.
- **Both rows go in one `$transaction`.** A user row whose account row never landed
  occupies the address, cannot sign in, and cannot be created again, because the retry
  answers 409 forever.
- **`role` is never read from the request body.** It is a literal in the handler. zod
  strips keys it doesn't know, so a body asking for `role: "admin"` is ignored rather
  than refused — `e2e/users-api.spec.ts` pins that the answer comes back as `agent`.
- **Duplicate address: catch Prisma `P2002`, don't pre-check.** A `findUnique` first is
  not race-proof, so it buys a round-trip and no correctness — and it makes the catch
  look unreachable, which is how the catch ends up untested and then wrong.
- **The validation schema lives in `core/schemas/users.ts`, shared with the client.**
  `users.routes.ts` and `prisma/seed.ts` both import it, and so does
  `client/src/features/users/components/CreateUserForm.tsx` — one definition,
  three readers.
  It was duplicated until 2026-10-22 on the belief that sharing was impossible here.
  That was half right: Node refuses to strip types **under `node_modules`**, which is
  exactly where npm symlinks a *workspace package* — but `core/` is a plain folder
  imported by relative path, so the restriction never applies. See the root
  `CLAUDE.md` → **Shared code (`core/`)** for the wiring that keeps it honest.

## Editing accounts

- **`PATCH /api/users/:id` takes the whole editable profile.** `name` and `email` are
  required, `password` is the only optional field. That is what the form sends, because
  the form is prefilled with the row and therefore always has both. The verb is still
  `PATCH` rather than `PUT` because the body never describes the whole resource: `role`
  and `id` are not editable here and no body can set them.
- **A blank password means "leave it alone", and that has to travel as an absent
  field.** `updateUserSchema` turns `""` into `undefined`, which `JSON.stringify` then
  drops, so the body carries no `password` key at all. The reason is hashing: the server
  hashes whatever it is given and a second hash of the same string is a different hash,
  so "no change" cannot be expressed as "the same value sent again". A body carrying
  `password: ""` would be a request to change the password *to* the empty string.
  - The order inside that schema is load-bearing: `.transform()` first, then `.refine()`
    for the 8-character rule. A `.min(8)` written in front of the transform sees the raw
    `""` and rejects the blank field — the exact opposite of the intent.
    `users-api-edit.spec.ts` pins both halves: a blank body succeeds and leaves the old
    password working, a 7-character one is a 400.
- **`src/users/update-user.ts` owns the write**, and it is not a mirror of
  `create-user.ts`: the two rows are not written together, because the profile always
  changes and the password usually does not. The hash is computed **outside** the
  transaction — Argon2 is deliberately slow and nothing in the transaction depends on
  it, so hashing inside would hold a connection and the row's lock open for no reason.
- **The credential row is updated with `updateMany`, and the count is checked.**
  `account` has no unique index on `(userId, providerId)`, so `update` cannot find the
  row by that pair. `updateMany` then answers `0` instead of throwing when nothing
  matched — so without the `count === 0` throw, a user with no credential account would
  get a `200` saying the password was changed when nothing was written. Throwing rolls
  the profile update back too, which is right: the caller asked for one change.
- **Missing row: catch Prisma `P2025`, don't pre-check** — same reasoning as `P2002` for
  a duplicate address. `user.update` is the only call in that transaction that can
  raise `P2025` — the account write beside it is an `updateMany`, which answers
  `count: 0` instead of throwing. Since 2026-10-25 its `where` also carries
  `deletedAt: null`, so `P2025` means "no such row **or** it is deleted"; both answer
  404, because a deleted user is not editable either.
- **Changing a password does not end that user's sessions.** Better Auth's sessions are
  rows keyed by token, not by the password hash, so someone already signed in stays
  signed in. Deliberate for now — see the Known gaps table in the root `CLAUDE.md`.

## Deleting accounts

- **It is a soft delete.** `DELETE /api/users/:id` stamps `User.deletedAt` and leaves
  the row. The roster goes on listing it — muted and badged on the client — because
  that is what later explains why its address still answers 409 to a create.
  `@@unique([email])` is deliberately left whole rather than made partial.
- **The rules live in the `WHERE`, not in a read before it.**
  `where: { id, role: { not: "admin" }, deletedAt: null }` — Prisma allows extra
  non-unique filters beside a unique one, so the database enforces "never an admin"
  and "don't re-stamp an existing timestamp" in one statement. `P2025` then triggers a
  single *diagnostic* read that only chooses between 404, `admin_not_deletable` and
  already-deleted. Same reasoning as `P2002` for a duplicate address: a check before
  the write cannot close the gap between itself and the write.
- **Deleting is idempotent and keeps the first timestamp.** A second DELETE answers 200
  with the row unchanged; the deletion that happened is the one recorded.
- **Wiping the user's sessions is part of the contract, not a side effect.** It is in
  the same transaction as the flag, because a user marked deleted whose sessions
  survived is the exact state the feature exists to prevent. A second sweep runs after
  the commit to narrow the race below. Raw `session.deleteMany` rather than Better
  Auth's `internalAdapter.deleteUserSessions`, so it can share the transaction — only
  safe because `cookieCache` is off.
  - No test can tell those two wipes apart; removing either alone leaves the suite
    green, and only removing both turns it red. That is written in the file so neither
    reads as dead code.
- **Signing back in is refused separately, in `auth.ts`.** A soft delete leaves the
  `user` row and its credential `account` row untouched, so the password still verifies
  — without this, deleting someone only logs them out until they type it again. This is
  the layer the course's reference project omits, which leaves its deleted users able
  to sign in and then 401 on everything.
  - `hooks.before` on `/sign-in/email` throws the *same* error a wrong password throws
    (`APIError.from("UNAUTHORIZED", BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD)`), so
    nobody can learn from outside whether an address belongs to a deleted account or to
    none at all. `users-api-delete.spec.ts` asserts the two bodies are *equal*.
  - `databaseHooks.session.create.before` returning `false` is the backstop, since
    `hooks.before` is shaped around one route's body. On its own it answers 401
    `FAILED_TO_CREATE_SESSION` — a message `LoginPage` prints verbatim — which is why
    it is second and not first.
- **`requireAuth` also 401s a session whose user is deleted**, for the race where a
  sign-in lands between the hook's read and the delete's commit. It does **not** cover
  `/api/auth/*`, which `index.ts` mounts above it — see the Known gaps table in the
  root `CLAUDE.md`.
- **`deletedAt` must be declared in `user.additionalFields`** or it never reaches
  `session.user`: Better Auth builds that object from the fields it knows about.
  Removing the declaration is a `tsc` error in `require-auth.ts`, which is the proof.
- **`PATCH` refuses a deleted user with 404**, via `deletedAt: null` in its own `where`.
  Deliberate even though the roster still shows the row: visible is not editable.
- **The seed revives a soft-deleted row** rather than skipping it. Its "already exists"
  check is by address, so skipping would report that about an account nobody can sign
  in to — and with no restore in the product, re-seeding would be the only way out and
  it would not work. A restore living in a script an admin runs is a different thing
  from a button.

## Tickets (inbound email)

- **A ticket is only ever created by `POST /api/webhooks/inbound-email`.** There is no
  `POST /api/tickets`, and that is the reference project's design rather than something
  missing: a ticket *is* an email, so the ingestion point is the only writer. The
  planning docs promised a manual create form as a stand-in; the reference code never
  built one, and `_resources/project/implementation-plan.md` now says so.
- **The request body is plain JSON** (`from`, `fromName`, `subject`, `body`,
  `bodyHtml?`), which is the shape the reference project uses at this step. A real
  provider posts `multipart/form-data`, so connecting one means adding a parser in front
  of this schema — not changing it. `express.json()` parses only
  `content-type: application/json`, so unlike the Better Auth handler this mount has no
  ordering constraint.
- **Three fields are absent from the schema on purpose, and zod strips rather than
  refuses them.** A body asking for `status: "closed"`, a `category` or an
  `assignedToId` gets an open, uncategorised, unassigned ticket instead of a 400 — the
  same decision `POST /api/users` makes about `role`, and
  `webhook-inbound-email.spec.ts` pins it. `status` comes from the column default;
  a classifier fills `category` in a later phase; assignment is its own endpoint.
- **`body` is neither trimmed nor capped.** Trimming would edit the customer's message.
  The reference project caps it at 1000 characters later in its build, which turns any
  real support email into a flat 400 — and once a provider is posting, a 400 means
  retried and then dropped. A spec sends 5000 characters to hold that open.
- **`from` is lowercased, which the reference project does not do.** The duplicate guard
  below compares `senderEmail` as bytes — only the subject comparison is
  case-insensitive — so the same person writing from two capitalisations would otherwise
  be two senders and the guard would miss. Same reasoning as `createUserSchema`, one
  notch weaker because nothing here signs in.
- **The duplicate guard is a guard, not threading.** When it matches it answers `200`
  with the ticket that already exists and **writes nothing at all**, because there is no
  `Reply` model yet — so the follow-up's body is lost. That is a recorded gap, not
  intended behaviour.
  - **It fires only when the subject claims to be a reply** (`Re:` / `Fwd:`, stacked or
    lower-cased). The reference project matches *any* subject, so two unrelated emails a
    customer happens to title "Help" collapse into one ticket and the second body
    vanishes. Creating one ticket too many is a mistake somebody can see and fix;
    swallowing a customer's message is not. The spec that holds this is
    *"the same subject twice without a reply prefix is two tickets"* — widen the
    condition and it is the only one that fails.
  - **The subject is stored stripped**, so a reply's `Re: ` never becomes part of the
    ticket's name — and stored a second time, lower-cased, as `subjectNormalized`.
  - **The match is plain equality against `subjectNormalized`, and that is a security
    boundary.** It used to compare `subject` with Prisma's `mode: "insensitive"`, which
    compiles to SQL `ILIKE` on Postgres and leaves `%` and `_` as live wildcards: a
    caller holding the secret could send `Re: %` and get back any open ticket of any
    address, body included. Confirmed against a running server on 2026-11-09, fixed on
    2026-11-10. Prisma parameterises the value, so this was never SQL injection — it was
    **pattern** injection, which parameterising does not touch. **Never reach for
    `mode: "insensitive"` on caller input again**; normalise on write instead, which also
    cannot be undone by the next person who adds a filter.
  - The guard also requires `status: "open"`, so a reply to a resolved ticket should
    create a new one. **That branch has no test**, because nothing can resolve a ticket
    yet — no `PATCH` endpoint, and the specs reach the database only over HTTP. Written
    into the spec file as a comment rather than left as a silent hole.
- **No `messageId` column.** It would make a retried delivery idempotent and would be
  the basis for real RFC 5322 threading, but nothing sends a message id to this endpoint
  today, so it would be a column nothing fills. It lands with the mail provider, which
  is when `Message-ID` / `In-Reply-To` / `References` start arriving.
- **No try/catch in the handler.** `ticket` carries no unique constraint and the body
  carries no foreign key, so there is no Prisma error worth a different status code, and
  Express 5 forwards a rejection on its own.
- **`PUBLIC_TICKET_FIELDS` is the allow-list the *webhook's* answers select** — it was
  "every answer" until `GET /api/tickets` arrived with its own, narrower one. `updatedAt`
  and `subjectNormalized` are left out of it deliberately: keeping a real column outside
  the list is what gives the specs' sorted-key-set assertion teeth. Drop the `select` and
  that assertion goes red.

## Tickets (the list)

- **`GET /api/tickets` is guarded by `requireAuth` alone** — the first route in the app
  with no second guard behind it. `/api/users` is admin-only because managing accounts
  is an admin's job; working tickets is what an agent is *for*
  (`_resources/project/mvp.md`), and an admin can do everything an agent can. The guard
  is on the router, the shape `users.routes.ts` uses, and `requireAdmin` is deliberately
  not imported in that file so nobody adds it by accepting an autocomplete suggestion.
  `tickets-api.spec.ts` pins it: an agent session gets the list.
- **It has its own allow-list, `TICKET_LIST_FIELDS`, and the narrowing is the point.**
  Seven fields; `body`, `bodyHtml` and `assignedToId` are out. Two rules decide it:
  a field earns its place by having a **reader**, not by having a column (`id` is drawn
  nowhere and stays, because the row's React key reads it); and the costs of guessing
  wrong are not symmetric — too narrow fails `tsc` on the client immediately, too wide
  ships a column to every browser with nothing ever complaining. `bodyHtml` is stored
  unsanitised (Known gaps, root `CLAUDE.md`), so one fewer consumer is strictly better.
- **Neither ticket constant is exported, and they are not shared.** Each lives in the
  route file that is its only reader. `e2e/tickets-api.spec.ts` hand-writes the field
  array it asserts, which is what makes reusing the wrong constant go red — a spec that
  imported the value under test could not notice the server reading the wrong one.
  **Move both into `src/tickets/ticket-fields.ts`, renaming `PUBLIC_TICKET_FIELDS` in the
  same go, the day `GET /api/tickets/:id` wants the full shape** — a genuine second
  reader across files is the trigger, not a line count.
- **Newest first, with no query parameters at all.** The order is the server's so the
  client never re-sorts: two places deciding one order is how they come to disagree, and
  the server is the one that can still be right once this list is paginated. Sorting,
  filtering, search and pagination are later units; a parameter nothing sends is a
  contract with no reader and would need its own validation and specs to mean anything.
- **Nothing indexes `createdAt`**, by the same rule as the other Ticket columns — the
  trigger is a measured slow query or pagination, not the first `ORDER BY`.
- **The status and category values are hand-written again on the client**
  (`client/src/features/tickets/api/get-tickets.ts`), because it cannot import a Prisma
  type and `erasableSyntaxOnly` rules out an enum on both sides. **Nothing enforces that
  the two agree** — a type-level assertion that did was written and removed the same day
  for costing more to read than it saved. See the Known gaps table in the root
  `CLAUDE.md` for what breaks and why it was left open.
- **`prisma/seed-tickets.ts` (`db:reseed:tickets`) is dev-only and separate from `prisma/seed.ts` on
  purpose.** `seed.ts` is what `db:seed:test` runs and `e2e/global-setup.ts` runs it
  before every Playwright run, so a ticket seeded there would become a row every ticket
  spec sees but did not create. Its guard is `truncate.ts`'s turned around: it refuses
  any database whose name ends in `_test`. It writes `status` and `category` directly,
  which no endpoint can yet, and sets `createdAt` explicitly so newest-first is visible
  without sleeping between inserts.

## Error handling

- **Every error answers `{ error: "<snake_case_code>" }`.** In use: `unauthenticated`
  (401), `invalid_webhook_secret` (401), `forbidden` (403), `admin_not_deletable` (403),
  `invalid_body` (400), `user_not_found` (404), `email_taken` (409),
  `internal_error` (500).
  Two codes share 401 as well: `unauthenticated` means no session was presented,
  `invalid_webhook_secret` means no session was *looked for* — a client should be able to
  tell which door turned it away.
  Two codes share 403 on purpose: `forbidden` means the *caller* may not be here,
  `admin_not_deletable` means the caller is entitled and the *target* is protected. A client reads the code; the prose for
  a person is the client's job.
- **One error-handling middleware, last in `index.ts`** — four parameters
  (`err, req, res, next`); three and Express silently treats it as ordinary
  middleware that never runs.
- **Routes don't `try/catch` just to produce a 500.** Express 5 forwards a rejected
  promise from an `async` handler to that middleware on its own. Catch only when the
  error should *change the response* (Prisma `P2002` → 409) — and `throw err` for
  anything unrecognised, or you swallow errors you never meant to handle.
- **Why bother, when Express already has a default handler:** the default is safe
  (it hides the stack once `NODE_ENV=production`) but replies in **HTML**. Ours keeps
  every error in the API one shape — JSON `{ error: "…" }`, same as 401/403 — and
  doesn't depend on an env var being set right. It's also where error→status mapping
  will live as the API grows.

## Database

- PostgreSQL on **localhost:5433**, DB `ticket_management`; `DATABASE_URL` in `.env`.
- Start your local Postgres before running the server or any `db:*` script.
- **Test DB:** `ticket_management_test` on the same server, configured by `.env.test`
  (gitignored; `.env.test.example` is committed). Only the Playwright run touches it.
  - `start:test` / `db:seed:test` use `node --env-file=.env.test`.
  - `db:truncate:test` empties every table (the Playwright `globalSetup` calls it before
    each run). It **refuses any database not named `*_test`** — the only thing separating
    it from the dev data is which env file loaded, so the guard is not optional.
    `db:reset:test` is the heavier hammer: it drops and re-applies migrations, for when
    the schema itself is wrong.
  - The `prisma` CLI can't take `--env-file`, so the `db:*:test` scripts set
    `DOTENV_CONFIG_PATH=.env.test` — `prisma.config.ts` does `import "dotenv/config"`,
    which reads that variable to pick the file.

## Environment-driven config

`src/config.ts` holds the three values that differ between the dev run and the E2E run —
`PORT`, `CLIENT_ORIGIN` (used by **both** CORS and `trustedOrigins`, so they can't
drift), and `RATE_LIMIT_ENABLED`. Don't hardcode ports or origins in `index.ts`/`auth.ts`.

**Rate limiting:** Better Auth's built-in limiter is enabled only when
`NODE_ENV=production` (default: 100 requests / 60s, stricter on sign-in). Keep it on in
production; `.env.test` sets `NODE_ENV=test` so E2E runs don't hit 429s.

## Gotchas

- **oxlint's `no-async-endpoint-handlers` is off** (`.oxlintrc.json`). It was written for
  Express 4, which dropped a rejected promise on the floor; Express 5 forwards it to the
  error handler, which is what this codebase relies on. It was never protecting anything
  here either — it skips a handler whose request parameter is named `_req`, which is the
  only reason the pre-existing async `GET /api/users` passed it.
- **Don't re-run `better-auth generate`** — it rewrites the `role` field back to String.
- After a schema change, if the client errors "Unknown argument X", run
  `npm run db:generate --workspace server` (migrate doesn't always regenerate the client).

## Structure

- `src/index.ts` — Express app wiring: middleware, mounts, error handler, `listen`
- `src/users/` — the `/api/users` module: `users.routes.ts` (the router),
  `create-user.ts` (the field allow-list + the row-writing function shared with
  `prisma/seed.ts`), `update-user.ts` (the profile/password write behind `PATCH`)
  and `delete-user.ts` (the soft delete behind `DELETE`)
- `src/tickets/` — the tickets module: `inbound-email.routes.ts` (the webhook's router,
  request schema, duplicate guard and field allow-list, all in one file) and
  `tickets.routes.ts` (`GET /api/tickets` and its own narrower allow-list) — see
  **Module layout** for why the two are separate files
- `src/auth.ts` — better-auth config · `src/require-auth.ts` — session guard
  · `src/require-admin.ts` — role guard · `src/require-webhook-secret.ts` — shared-secret
  guard for the one caller that is not a person
- `src/db.ts` — Prisma client · `prisma/` — schema, migrations, `seed.ts`

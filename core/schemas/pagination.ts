import { z } from "zod";

// How many rows one page of a list holds, for every list in the app.
//
// **Read by four modules, which is why it is here rather than beside either
// endpoint**: the two list routes slice with it (`skip`/`take`), and the two
// client list hooks put it into the page state they hand their table
// (`pageSize`, which the footer then reads back off the instance). A copy on
// each side would be two numbers that have to agree with nothing saying when
// they stopped — and the way they would fail is quiet, not loud: the client
// would draw the wrong range and the wrong page count over rows that are
// themselves correct.
//
// It was `TablePagination` rather than the two hooks until 2026-11-21, when
// pagination moved onto TanStack Table's `rowPaginationFeature`: the footer
// now reads `pageSize` out of the table's pagination state instead of
// importing it, so this constant has one fewer reader on the client and one
// more on each hook. Worth recording only because the sentence above names its
// readers, and a list of readers is the kind of comment that goes stale
// silently.
//
// **It is not a query parameter.** `?pageSize=` would be a parameter nothing
// sends — no control on either page offers a choice — and the repo's rule is
// that a field earns its place by having a reader. The cost of leaving it out
// is that a caller cannot ask for 50 rows; the cost of putting it in is an
// endpoint that will answer 100 rows to anyone who asks, which is most of what
// pagination was added to stop. Trigger for making it one: a page-size control
// in a toolbar, which is the first thing that would actually read it.
export const PAGE_SIZE = 10;

// The page half of a list query, extended by each list's own schema rather
// than restated in it — the same arrangement `updateUserSchema` has with
// `createUserSchema` in users.ts, and for the same reason: `?page=` means one
// thing in this app, so one definition should say what it means.
//
// **`z.coerce` is what makes it usable on `req.query`.** Express hands every
// query parameter over as a string, so a plain `z.number()` would refuse
// `?page=2` from a real browser. The client parses the same URL with the same
// schema, so it gets the same coercion for free.
//
// **`.default(1)` is what keeps `/tickets` free of a query string.** It fires
// on `undefined` only — never on `null`, which is what `URLSearchParams.get()`
// answers for a parameter that is not there, so every client-side read of it
// needs `?? undefined`. That gap is written up at length in
// `client/src/features/tickets/hooks/use-ticket-list-query.ts`; it is the same
// gap here and not a new one.
//
// `.int().min(1)` makes anything else a 400 rather than a silent fall back to
// page 1: `?page=0`, `?page=-3`, `?page=abc` and `?page=1.5` are all mistakes a
// caller can fix, and defaulting them quietly is how a client ships a typo for
// months and reads it as working. Note what `z.coerce.number()` accepts that
// may surprise: `?page=` (empty) coerces to 0 and is refused by `.min(1)`,
// which is the answer we want, but by a route nobody would guess from reading
// the chain.
//
// **No cap is written here, and `.int()` is already one.** zod 4 checks a *safe*
// integer, not `Number.isInteger`, so the top of the range is refused for us:
// measured 2026-11-21, `?page=1e308` and `?page=9007199254743` answer
// `too_big`, and `?page=Infinity` / `?page=1e400` answer `invalid_type`. That
// matters more than it looks — it is what stops `skip` from ever being `NaN` or
// `Infinity`, which would be a 500 on every request rather than an empty page.
// This comment credited `.int().min(1)` only with refusing `1.5` and `abc`
// until the security review measured the rest.
//
// **And a cap below that would buy nothing**, which is the part worth knowing
// before someone adds one for performance. Measured on the route's real
// `ORDER BY … LIMIT 10 OFFSET n` over 100 rows: `OFFSET 0` and
// `OFFSET 2000000000` produce the same plan at the same cost, because Postgres
// cannot skip rows it has not produced — it reads the matching set, sorts it and
// discards. So a huge page number costs exactly what page 1 costs. What *does*
// scale is the sort bound (`offset + limit`): by `OFFSET 500` the executor has
// already given up its ten-tuple heapsort and sorts everything, at a page
// number somebody could reach by clicking. **Deep paging is the cost, and an
// index is its answer, not a cap** — `schema.prisma` records that trigger on
// the model. If a cap is ever added, add it for the honest reason: a page
// nobody can reach is a mistake worth refusing.
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
});

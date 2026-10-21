import { Router } from "express";
import prisma from "../db.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { requireAuth } from "../require-auth.ts";
import { requireAdmin } from "../require-admin.ts";
import { createUserSchema } from "../../../core/schemas/users.ts";
import { createUserWithPassword } from "./create-user.ts";

// Mounted at /api/users by index.ts, so every path below is relative to that.
// Keeping the prefix at the mount point means it is written once and a rename
// touches one line instead of every route.
const router = Router();

// Both guards once, for the whole router, rather than repeated on each route.
// Every route here is admin-only and the ones still to come (PATCH, DELETE)
// will be too — and the mistake that actually ships is a new route added
// without them, not a route that needed to opt out. Order still matters:
// requireAdmin reads the session requireAuth puts on res.locals.
router.use(requireAuth, requireAdmin);

// `select` is an allow-list, not a convenience: the user table also holds
// emailVerified, image and whatever a later migration adds, and a bare
// findMany() would ship every one of those to the browser the day it appears.
//
// No try/catch: Express 5 forwards a rejected promise to the error handler in
// index.ts on its own. Catch only when an error should change the response —
// as POST below does for a duplicate address.
router.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  res.json({ users });
});

// Public sign-up is disabled, so Better Auth's signUpEmail is unavailable and
// the rows are written directly — see create-user.ts for the shape they have to
// take, and why the seed script writes them through the same function.
router.post("/", async (req, res) => {
  // safeParse rather than parse: a malformed body is a client mistake, not a
  // server fault, so it answers 400 instead of falling through to the 500
  // handler. Express 5 leaves req.body undefined when nothing parsed, which
  // safeParse rejects on its own — no property is read off it by hand.
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }

  try {
    // role is a literal, never read from the body. zod strips keys it does not
    // know, so a request asking for role:"admin" is ignored rather than
    // refused — an escalation attempt gets an agent, not an error.
    const user = await createUserWithPassword({
      ...parsed.data,
      role: "agent",
    });
    res.status(201).json({ user });
  } catch (err) {
    // The transaction can violate exactly one unique constraint: user.email.
    // (session.token is the schema's only other one, and nothing here writes a
    // session.) So P2002 means the address is taken. No findUnique pre-check
    // above: it cannot close the race this catch closes, and having both would
    // make this branch look unreachable — which is how it would rot untested.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      res.status(409).json({ error: "email_taken" });
      return;
    }
    // Not ours to interpret. Re-throw, or we swallow bugs as 409s.
    throw err;
  }
});

export default router;

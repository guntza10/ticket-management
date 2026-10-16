import { Router } from "express";
import prisma from "../db.ts";
import { requireAuth } from "../require-auth.ts";
import { requireAdmin } from "../require-admin.ts";

// Mounted at /api/users by index.ts, so every path below is relative to that.
// Keeping the prefix at the mount point means it is written once and a rename
// touches one line instead of every route.
const router = Router();

// Both guards once, for the whole router, rather than repeated on each route.
// Every route here is admin-only and the ones still to come will be too — and
// the mistake that actually ships is a new route added without them, not a
// route that needed to opt out. Order still matters: requireAdmin reads the
// session requireAuth puts on res.locals.
router.use(requireAuth, requireAdmin);

// `select` is an allow-list, not a convenience: the user table also holds
// emailVerified, image and whatever a later migration adds, and a bare
// findMany() would ship every one of those to the browser the day it appears.
//
// No try/catch: Express 5 forwards a rejected promise to the error handler in
// index.ts on its own. Catch only when an error should change the response.
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

export default router;

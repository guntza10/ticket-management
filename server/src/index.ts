import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import prisma from "./db.ts";
import { auth } from "./auth.ts";
import { requireAuth } from "./require-auth.ts";
import { requireAdmin } from "./require-admin.ts";
import { CLIENT_ORIGIN, PORT } from "./config.ts";

const app = express();

// Allow the Vite SPA (different origin) to call this API and send its session
// cookie. credentials:true is required for cookie-based auth across origins.
// Must run before the route handlers so preflight requests are answered.
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  }),
);

// Better Auth handler (sign-up / sign-in / get-session, etc.).
// Must be mounted BEFORE express.json(): it reads the raw request body itself,
// and global JSON parsing above it would make client calls hang.
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

// Protected demo route: requireAuth returns 401 without a valid session.
// Return only the fields a client needs. The full session object also carries
// session.token, ipAddress and userAgent — and the session cookie is httpOnly
// precisely so scripts can't read the token, so handing it back as JSON here
// would defeat that.
app.get("/api/me", requireAuth, (_req, res) => {
  const { user } = res.locals.session;
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
});

// Admin-only user list. The two guards are mounted in order and read top to
// bottom as the sentence they enforce: authenticate, then authorize.
//
// `select` is an allow-list, not a convenience: the user table also holds
// emailVerified, image and whatever a later migration adds, and a bare
// findMany() would ship every one of those to the browser the day it appears.
// No try/catch: Express 5 forwards a rejected promise to the error handler
// below on its own. Catch here only when an error should change the response
// (e.g. a Prisma unique-constraint violation becoming a 409) — and re-throw
// anything unrecognised.
app.get("/api/users", requireAuth, requireAdmin, async (_req, res) => {
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

app.get("/", (_req, res) => {
  res.send("Ticket Management API");
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Last in the chain on purpose: Express only reaches an error handler after
// every route above has passed on the error, and it recognises one by its
// arity — exactly four parameters. Write three and it is silently treated as
// ordinary middleware that never runs.
//
// Express's own handler is already safe — it hides the stack once NODE_ENV is
// production — but it answers in HTML. This exists so a 500 looks like every
// other error the API returns instead of making clients parse two shapes, and
// so that behaviour doesn't depend on an env var being set correctly. It is
// also the one place that will map known errors to real status codes as the
// API grows, e.g. a Prisma P2002 to 409.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  console.error(`[${req.method} ${req.originalUrl}]`, err);
  res.status(500).json({ error: "internal_error" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

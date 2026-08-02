import express from "express";
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
app.get("/api/users", requireAuth, requireAdmin, async (_req, res) => {
  try {
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
  } catch (err) {
    console.error("[GET /api/users]", err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.get("/", (_req, res) => {
  res.send("Ticket Management API");
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Proves the app is connected to the database. Public on purpose — a health
// check has to be callable without a session — so it must say nothing beyond
// up/down: the row count is business data, and the driver's error text names
// the host, port and tables. Both stay server-side.
app.get("/db/health", async (_req, res) => {
  try {
    await prisma.ticket.count();
    res.json({ database: "connected" });
  } catch (err) {
    console.error("[db/health]", err);
    res.status(500).json({ database: "error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

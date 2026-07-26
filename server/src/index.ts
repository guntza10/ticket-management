import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import prisma from "./db.ts";
import { auth } from "./auth.ts";
import { requireAuth } from "./require-auth.ts";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Allow the Vite SPA (different origin) to call this API and send its session
// cookie. credentials:true is required for cookie-based auth across origins.
// Must run before the route handlers so preflight requests are answered.
app.use(
  cors({
    origin: "http://localhost:5173",
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

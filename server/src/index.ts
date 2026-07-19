import express from "express";
import { toNodeHandler } from "better-auth/node";
import prisma from "./db.ts";
import { auth } from "./auth.ts";
import { requireAuth } from "./require-auth.ts";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Better Auth handler (sign-up / sign-in / get-session, etc.).
// Must be mounted BEFORE express.json(): it reads the raw request body itself,
// and global JSON parsing above it would make client calls hang.
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

// Protected demo route: requireAuth returns 401 without a valid session.
app.get("/api/me", requireAuth, (_req, res) => {
  res.json(res.locals.session);
});

app.get("/", (_req, res) => {
  res.send("Ticket Management API");
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Proves the app is connected to the database.
app.get("/db/health", async (_req, res) => {
  try {
    const tickets = await prisma.ticket.count();
    res.json({ database: "connected", tickets });
  } catch (err) {
    res
      .status(500)
      .json({ database: "error", message: (err as Error).message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

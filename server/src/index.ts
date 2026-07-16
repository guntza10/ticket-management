import express from "express";
import prisma from "./db.ts";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

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

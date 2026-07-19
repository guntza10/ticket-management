import type { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.ts";

// Guard middleware: allow the request only if a valid session exists.
// Authentication-only — it checks "is there a session?", not the user's role.
// No session -> 401 (the caller is not authenticated, so we can't even reach
// an authorization check). On success, the session is attached to res.locals
// for downstream handlers.
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session) {
    return res.status(401).json({ error: "unauthenticated" });
  }

  res.locals.session = session;
  next();
}

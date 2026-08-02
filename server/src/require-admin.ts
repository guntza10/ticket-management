import type { Request, Response, NextFunction } from "express";

// Guard middleware: allow the request only if the signed-in user is an admin.
// Authorization-only — it answers "may this user do this?", never "who is
// this?". It reads res.locals.session, so it must be mounted *after*
// requireAuth; on its own it would throw rather than reject.
//
// 403, not 401: the caller is authenticated, we simply refuse them. Answering
// 401 would tell the client to sign in again, which cannot change an agent's
// role and would just loop them through the login page.
export function requireAdmin(_req: Request, res: Response, next: NextFunction) {
  if (res.locals.session.user.role !== "admin") {
    return res.status(403).json({ error: "forbidden" });
  }

  next();
}

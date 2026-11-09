import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

// Read at module load with a throw, the same shape as BETTER_AUTH_SECRET in
// auth.ts and DATABASE_URL in db.ts. The course warns and keeps going, then
// answers 500 to every delivery (require-webhook-secret.ts:5-8 in its repo) —
// so a deploy that forgot the variable looks healthy while silently refusing
// every ticket. Refusing to start is the louder and therefore safer failure.
const secret = process.env.WEBHOOK_SECRET;
if (!secret) {
  throw new Error(
    "WEBHOOK_SECRET is not set. Copy server/.env.example to server/.env and fill it in.",
  );
}

const expected = Buffer.from(secret, "utf8");

// Guard middleware: allow the request only if it carries the secret we share
// with whatever is posting mail to us.
//
// Authentication for a caller that is not a person, which is why requireAuth is
// the wrong guard rather than a missing one. requireAuth asks "is there a
// session?" — a question a mail provider can never answer, because it holds no
// cookie and never will. This asks the only question that applies to it. Same
// split as requireAuth vs requireAdmin: different question, different
// middleware, different status code.
//
// `invalid_webhook_secret` rather than `unauthenticated`: that code means "no
// session", and no session was looked for here. A client reading the code
// should be able to tell which door it was turned away from.
//
// Header only. The course also reads `req.query.secret`, which puts the
// credential in a URL and therefore into access logs, proxy logs and error
// reports. Nothing outside this repo calls this route yet, so header-only costs
// nothing today — and it does not have to be undone later either: SendGrid's
// Inbound Parse cannot send a custom header at all (its setup takes a receiving
// domain and a destination URL, nothing else), and the answer there is one of
// its security policies — ECDSA signature verification, or OAuth, where
// SendGrid fetches a token and sends it as `Authorization: Bearer` — not moving
// this secret into a query string.
export function requireWebhookSecret(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const provided = req.headers["x-webhook-secret"];

  // A repeated header arrives as an array, which is not a credential anyone
  // meant to send; refuse it rather than pick one.
  if (typeof provided !== "string") {
    return res.status(401).json({ error: "invalid_webhook_secret" });
  }

  const candidate = Buffer.from(provided, "utf8");

  // timingSafeEqual, not `!==` as the course uses: it compares every byte
  // instead of stopping at the first difference. It *throws* on a length
  // mismatch, so the lengths are compared first — and a wrong length answers
  // the same 401 as a wrong value, which is the point of using it at all.
  //
  // Be clear about what this is worth: **no test in this suite can tell the two
  // implementations apart**, and over a network jitter swamps the timing
  // difference anyway. It is here because it costs four lines and is the habit
  // to have, not because anything is guarding it. Swap it for `!==` and the
  // suite stays green.
  if (
    candidate.length !== expected.length ||
    !timingSafeEqual(candidate, expected)
  ) {
    return res.status(401).json({ error: "invalid_webhook_secret" });
  }

  next();
}

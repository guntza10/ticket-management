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

const expectedSecret = Buffer.from(secret, "utf8");

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
  const header = req.headers["x-webhook-secret"];

  // This branch is the header being absent. It is *not* the duplicated-header
  // case, which an earlier version of this comment claimed: Node joins repeated
  // values with ", " rather than handing over an array (only set-cookie is ever
  // an array), so a doubled header arrives as a string and is refused on length
  // below. Both are covered by specs.
  if (typeof header !== "string") {
    console.warn("[webhook] refused: no x-webhook-secret header");
    return res.status(401).json({ error: "invalid_webhook_secret" });
  }

  const providedSecret = Buffer.from(header, "utf8");

  // timingSafeEqual, not `!==` as the course uses: it compares every byte
  // instead of stopping at the first difference. It *throws* on a length
  // mismatch, so the lengths are compared first — and a wrong length answers
  // the same 401 as a wrong value, which is the point of using it at all.
  //
  // Be clear about which half of this the suite guards. The *timing* property
  // it exists for: nothing here can tell it from a plain `!==`, and over a
  // network jitter swamps the difference anyway — it is four lines and the right
  // habit, not a closed hole. Its *correctness*: guarded, by one spec sending a
  // wrong secret of exactly the same length. Before that spec existed the
  // length comparison below short-circuited every wrong secret the suite sent,
  // so this line never ran once and a comparison that accepted anything of the
  // right length left 21 of 22 specs green.
  if (
    providedSecret.length !== expectedSecret.length ||
    !timingSafeEqual(providedSecret, expectedSecret)
  ) {
    // The miss is logged, never the value that was sent. Without any log a
    // caller can guess at this secret indefinitely and nothing on our side
    // would show it had happened — there is no rate limit in front of it yet
    // either (see the root CLAUDE.md Known gaps).
    console.warn("[webhook] refused: x-webhook-secret did not match");
    return res.status(401).json({ error: "invalid_webhook_secret" });
  }

  next();
}

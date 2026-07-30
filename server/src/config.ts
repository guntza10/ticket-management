// Values that differ between the dev run and the Playwright E2E run.
// The E2E run loads server/.env.test, which puts the API on 3001 and the SPA
// on 5174 so both can run alongside a normal dev environment on 3000/5173.

export const PORT = Number(process.env.PORT) || 3000;

// The SPA's origin — needed twice: by CORS (the browser's gate) and by Better
// Auth's trustedOrigins (its CSRF gate). One source so they can't drift apart.
export const CLIENT_ORIGIN =
  process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

// Better Auth's built-in rate limiter is on only when NODE_ENV=production.
// The E2E run sets NODE_ENV=test, so it stays off there: tests sign in far more
// often than a person would and would otherwise start getting 429s.
export const RATE_LIMIT_ENABLED = process.env.NODE_ENV === "production";

import axios from "axios";

// Base URL of the Express API. The auth client points at the same value; both
// read it from here so a change to VITE_API_URL can never move only half the
// app onto a different server.
export const API_URL: string =
  import.meta.env.VITE_API_URL ?? "http://localhost:3000";

// One axios instance for every call to our own API. `withCredentials` is the
// reason it exists: the API is cross-origin, so without it the browser sends no
// session cookie and the server answers 401 — and setting that per call is
// exactly the kind of thing that gets forgotten on one endpoint out of twenty.
// axios also rejects on 4xx/5xx (fetch resolves), so callers don't check status
// by hand, and it parses the JSON body into `data` for them.
export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// A session that is gone — expired, or signed out in another tab — answers 401
// to everything. Without this, the page stays on screen and every click
// produces an error with no explanation, which reads as the app being broken
// rather than as being signed out.
//
// Better Auth already handles the half it can see: its session store refetches
// on window focus and nulls itself on a 401, so ProtectedRoute sends the
// person to /login on the next reload or tab switch. What it cannot see is
// *this* instance — calls to our own /api/users never pass through Better
// Auth, so nothing there learns that the server refused one. That gap is the
// only reason this exists.
//
// Note which 401 can actually arrive here today: every call through this
// instance goes to the admin-only /api/users, so a *deleted* user never reaches
// one — an agent's clicks produce 403, and an admin cannot be soft-deleted at
// all. An earlier version of this comment listed that case anyway. It becomes
// real with the tickets domain, which gives an agent endpoints of their own.
// `e2e/session-expiry.spec.ts` drives the reachable case in a browser.
api.interceptors.response.use(undefined, (error: unknown) => {
  // 401 only. An agent reaching an admin-only route gets 403, which has to
  // reach the caller untouched — it means "signed in, not allowed", and
  // redirecting to a login page would be the wrong answer to it.
  //
  // `error.response` rather than `error.status`: a request React Query aborts
  // on unmount rejects with a CanceledError that carries no response at all.
  const status =
    axios.isAxiosError(error) && error.response ? error.response.status : null;

  // Already there — the login page itself makes no calls through this instance
  // today, but a future one would otherwise reload in a loop.
  const elsewhere = window.location.pathname !== "/login";

  if (status === 401 && elsewhere) {
    // `replace`, so the back button does not return to a page that cannot
    // load. No signOut() call: this module cannot import the auth client
    // without a cycle — auth-client.ts reads API_URL from here, and ES imports
    // hoist, so it would evaluate createAuthClient before API_URL exists — and
    // a full page load rebuilds that store from nothing anyway.
    window.location.replace("/login");
  }

  // Rethrow regardless, or every caller's catch receives undefined and React
  // Query treats a failed request as a successful one with no data.
  return Promise.reject(error);
});

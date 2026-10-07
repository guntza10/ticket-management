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

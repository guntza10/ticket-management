// Base URL of the Express API. The auth client points at the same value; both
// read it from here so a change to VITE_API_URL can never move only half the
// app onto a different server.
export const API_URL: string =
  import.meta.env.VITE_API_URL ?? "http://localhost:3000";

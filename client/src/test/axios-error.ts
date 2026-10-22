import { AxiosError, type AxiosResponse } from "axios";

// A rejection shaped the way the app's error handling reads it.
//
// It has to be a real AxiosError, not a plain Error carrying a status: both
// CreateUserForm and anything else branching on a failed request reach for
// `isAxiosError`, which checks a flag the class sets on itself. A hand-rolled
// object with the right fields still falls through to the generic path, so a
// test built on one would prove the opposite of what it claims.
//
// Only `response.status` is ever read, so the remaining constructor arguments
// are the minimum Axios accepts rather than a faithful response.
//
// It lives here because more than one test needs it, and the explanation above
// is the part that must not exist in two copies. Naming the callers would be
// maintenance nobody does — and would be wrong already: the status is a
// parameter precisely because they do not want the same one.
export function axiosErrorWithStatus(status: number) {
  return new AxiosError(
    `Request failed with status code ${status}`,
    String(status),
    undefined,
    undefined,
    { status } as AxiosResponse,
  );
}

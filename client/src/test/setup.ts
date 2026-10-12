// Runs before every test file (see `test.setupFiles` in vite.config.ts).
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest runs without `globals`, so Testing Library's automatic cleanup — which
// registers itself on a global `afterEach` — never installs. Unmounting by hand
// keeps one test's render out of the next test's document, where a query would
// otherwise match an element the previous test left behind.
afterEach(cleanup);

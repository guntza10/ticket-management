import { defineConfig, devices } from "@playwright/test";

// The E2E run is a second, isolated copy of the whole app: its own API port,
// its own Vite port, and its own database (server/.env.test → ticket_management_test).
// That is what lets `npm run dev:*` keep running on 3000/5173 while tests run.
const CLIENT_URL = "http://localhost:5174";
const API_URL = "http://localhost:3001";

export default defineConfig({
  testDir: "./e2e",
  // Wipes and re-seeds ticket_management_test before the run. Playwright starts
  // the webServers below first, so the API is already up when this executes.
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  // Fail the run if a test was left focused with .only.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",

  use: {
    // Tests navigate with page.goto("/login") — this is what "/" resolves to.
    baseURL: CLIENT_URL,
    // Keep the trace of any failed attempt. "on-first-retry" would capture
    // nothing locally, where retries are 0 — exactly when a trace is wanted.
    trace: "retain-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Playwright starts both servers, waits for each url to answer, and shuts
  // them down when the run ends. reuseExistingServer stays false on purpose:
  // silently reusing whatever already listens on the port is how a test run
  // ends up talking to the dev database.
  webServer: [
    {
      name: "api",
      command: "npm run start:test --workspace server",
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      name: "client",
      command: "npm run dev:test --workspace client",
      url: CLIENT_URL,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});

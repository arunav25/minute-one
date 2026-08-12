import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests.
 *
 * `testDir` is the point of this file. Without it Playwright globs the whole
 * repo, picks up the Vitest `*.test.ts` files, and dies importing Vitest
 * outside its runner — which reads as "the e2e suite is broken" when in fact it
 * had never been pointed at any tests.
 *
 * The server runs through `npm run demo`, not `npm run dev`: the guide is
 * loaded from the built `public/minute-one.js`, and `dev` alone does not build
 * it, so the tests would run against a stale bundle or none at all.
 */
/*
 * Point at an already-running server with MINUTE_ONE_BASE_URL — `npm run
 * dev:https` serves HTTPS on the same port, and probing it over HTTP fails, so
 * Playwright would otherwise try to start a second server and hit EADDRINUSE.
 */
const baseURL = process.env.MINUTE_ONE_BASE_URL ?? "http://localhost:3200";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    // The local certificate is signed by a CA the machine trusts, but
    // Playwright's bundled Chromium ships its own store and does not.
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run demo",
    url: `${baseURL}/embed-test`,
    ignoreHTTPSErrors: true,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for GoHa end-to-end flows.
 *
 * Requires a running app backed by a MIGRATED database (see docs/BUILD_PLAN.md).
 * The `setup` project signs in once (bootstrapping the owner on a fresh test DB,
 * or logging in if it already exists) and saves the session; the `chromium`
 * project reuses that storage state. By default Playwright starts the dev server
 * itself; point E2E_BASE_URL at an already-running instance to skip that.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  // The first hit to the heavy /api/auth route cold-compiles under `next dev`
  // (better-auth + drizzle + neon), which can take longer than Playwright's
  // 30s default. Give each test room so that one-time compile is not a flake.
  timeout: 90_000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm exec next dev --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        // Better Auth validates the request Origin against its baseURL. The dev
        // env sets BETTER_AUTH_URL to the normal :3000 dev port, but E2E runs the
        // server on E2E_PORT (:3100), so without this override every auth request
        // is rejected as INVALID_ORIGIN. A real process env var takes precedence
        // over .env.local in Next, so this points Better Auth at the test origin.
        env: { BETTER_AUTH_URL: baseURL },
      },
});

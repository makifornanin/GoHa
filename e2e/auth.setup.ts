import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test as setup } from "@playwright/test";

/**
 * Signs in once and stores the session for the other specs. On a fresh test
 * database this bootstraps the single owner via /register; if the owner already
 * exists, /register redirects to /login and we sign in with the same
 * credentials. Uses dedicated test credentials so it never touches real data.
 */
const authFile = path.join(process.cwd(), "e2e/.auth/user.json");

// Defaults match the isolated harness account created by
// `pnpm test:account:create` (scripts/test-account.mts). GoHa is single-owner,
// so the suite cannot bootstrap its own account through /register once a real
// owner exists; the harness account is inserted directly and logs in normally.
const email = process.env.E2E_EMAIL ?? "e2e.harness@goha.test";
const password = process.env.E2E_PASSWORD ?? "goha-e2e-harness-pw";
const name = process.env.E2E_NAME ?? "E2E Harness";

setup("authenticate (bootstrap or login)", async ({ page }) => {
  // This step deliberately absorbs the whole cold-start cost of `next dev`
  // (see the warm-up loop below), which is far more than one screen's worth of
  // compiling, so it gets its own budget rather than the suite's 90s default.
  setup.setTimeout(360_000);
  mkdirSync(path.dirname(authFile), { recursive: true });

  await page.goto("/register");

  if (new URL(page.url()).pathname.startsWith("/register")) {
    // Bootstrap the owner account (one-time on a fresh DB).
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create owner account" }).click();
  } else {
    // Owner already exists: sign in.
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
  }

  await page.waitForURL("**/today");
  await expect(page).toHaveURL(/\/today/);

  await page.context().storageState({ path: authFile });

  // Warm every route once.
  //
  // Under `next dev` each route and each Server Action compiles on its FIRST
  // use, which lands entirely on whichever test happens to touch it first. That
  // is why a suite run against a freshly started dev server failed on timings
  // (a dialog not closing, an edge not rendering) while the identical run
  // against a warm server passed: the assertions were racing Turbopack, not the
  // app. Paying the compile cost here once makes the suite measure the product.
  for (const route of [
    "/today",
    "/tasks",
    "/goals",
    "/life-areas",
    "/habits",
    "/focus",
    "/brain-dump",
    "/task-maps",
    "/calendar",
    "/review",
    "/progress",
    "/settings",
  ]) {
    await page.goto(route, { waitUntil: "networkidle" });
  }
});

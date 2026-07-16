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

const email = process.env.E2E_EMAIL ?? "owner.e2e@goha.test";
const password = process.env.E2E_PASSWORD ?? "goha-e2e-password";
const name = process.env.E2E_NAME ?? "E2E Owner";

setup("authenticate (bootstrap or login)", async ({ page }) => {
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
});

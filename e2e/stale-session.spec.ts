import { expect, test } from "@playwright/test";

/**
 * A session cookie can outlive its session (expired, revoked, or the account
 * deleted). When that happens the user must still be able to reach the login
 * form. Redirecting away from /login on cookie PRESENCE alone caused an
 * infinite bounce (/login -> /today -> /login...), i.e. ERR_TOO_MANY_REDIRECTS,
 * locking the user out entirely.
 *
 * Runs without the shared storage state so it controls the cookie itself.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test("a stale session cookie still lands on a usable login form", async ({ page, baseURL }) => {
  const url = new URL(baseURL ?? "http://localhost:3100");

  // A well-formed but meaningless session cookie: present, never valid.
  await page.context().addCookies([
    {
      name: "better-auth.session_token",
      value: "stale.definitely-not-a-real-session",
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.goto("/login");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByLabel("Email")).toBeVisible();

  // A protected route must also settle on the login form, not ping-pong.
  await page.goto("/today");
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  await expect(page.getByLabel("Password")).toBeVisible();
});

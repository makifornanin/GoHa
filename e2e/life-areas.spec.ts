import { expect, test } from "@playwright/test";

/**
 * The core persistence guarantee for Life Areas: a created area survives a full
 * page reload (i.e. it was written to Postgres, not just held in client state).
 */
test("create a life area, reload, and confirm it persisted", async ({ page }) => {
  const name = `E2E Area ${Date.now()}`;

  await page.goto("/life-areas");

  // Open the create modal and fill it in.
  await page.getByTestId("new-life-area").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create life area" }).click();

  // The new card appears (after the Server Action + revalidation).
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // Reload from the server: if it persisted, the card is still there.
  await page.reload();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // Clean up so the test is repeatable, exercising archive too.
  const card = page.getByTestId("life-area-card").filter({ hasText: name });
  await card.getByRole("button", { name: `Archive ${name}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.getByRole("heading", { name })).toHaveCount(0);
});

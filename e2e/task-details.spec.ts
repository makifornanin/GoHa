import { expect, test } from "@playwright/test";

/**
 * The detail panel is now the way a task is read and edited, so it needs the
 * same protection the list has: opening it from a card, adding checklist steps,
 * committing a field without a Save button, and — most easily broken — keeping
 * subtasks OUT of the top-level list they do not belong in.
 */
test("open a task's details, add subtasks, and change a field", async ({ page }) => {
  const title = `E2E details ${Date.now()}`;

  await page.goto("/tasks");

  // Create a task to work with.
  await page.getByTestId("new-task").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  // The card's title opens the panel.
  await page.getByRole("button", { name: title, exact: true }).first().click();
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible({ timeout: 15_000 });

  // Two checklist steps.
  const stepInput = panel.getByLabel("Add a subtask");
  for (const step of ["Draft it", "Send it"]) {
    await stepInput.fill(step);
    await stepInput.press("Enter");
    await expect(panel.getByText(step, { exact: true })).toBeVisible({ timeout: 15_000 });
  }

  // Ticking a step moves the counter.
  await panel.getByRole("checkbox", { name: "Complete Draft it" }).click();
  await expect(panel.getByText("1/2", { exact: true })).toBeVisible({ timeout: 15_000 });

  // Fields commit on change: no Save button to press.
  await panel.getByLabel("Priority").click();
  await page.getByRole("option", { name: "High", exact: true }).click();
  await page.waitForTimeout(1500);

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden({ timeout: 10_000 });

  // Survives a reload, and the card reflects both changes.
  await page.reload({ waitUntil: "networkidle" });
  const card = page.getByTestId("task-card").filter({ hasText: title });
  await expect(card).toContainText("High", { timeout: 15_000 });
  await expect(card).toContainText("1/2");

  // Subtasks must never appear as top-level rows of their own.
  await expect(
    page.getByTestId("task-card").filter({ hasText: "Draft it" }).filter({ hasNotText: title }),
  ).toHaveCount(0);
});

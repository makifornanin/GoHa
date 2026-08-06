import { expect, test } from "@playwright/test";

/**
 * The connected-system guarantee (CLAUDE.md section 7): completing a task linked
 * to a goal is reflected in that goal's derived progress. Creates an auto-progress
 * goal (0%), links a single task, completes it, and confirms the goal reads 100%
 * (1/1). Cleans up after itself so it is repeatable.
 */
test("completing a task updates its goal's derived progress", async ({ page }) => {
  const stamp = Date.now();
  const goalName = `E2E Goal ${stamp}`;
  const taskName = `E2E Task ${stamp}`;

  // 1. Create an auto-progress goal. With no tasks it reads 0%.
  await page.goto("/goals");
  // The header "Add Goal" button only shows when goals exist; on a fresh DB the
  // empty state's "Create your first goal" is the create entry point instead.
  await page
    .getByTestId("new-goal")
    .or(page.getByRole("button", { name: "Create your first goal" }))
    .first()
    .click();
  const goalDialog = page.getByRole("dialog");
  await goalDialog.getByLabel("Title").fill(goalName);
  await goalDialog.getByRole("button", { name: "Create goal" }).click();

  const goalCard = () => page.getByTestId("goal-card").filter({ hasText: goalName });
  await expect(goalCard()).toContainText("0%");

  // 2. Create a task linked to that goal. Left unscheduled, so it lands in Inbox.
  await page.goto("/tasks");
  await page
    .getByTestId("new-task")
    .or(page.getByRole("button", { name: "Create your first task" }))
    .first()
    .click();
  const taskDialog = page.getByRole("dialog");
  await taskDialog.getByLabel("Title").fill(taskName);
  // The goal picker is a custom combobox (not a native <select>), and its
  // options are portaled to <body>, so drive it by click rather than
  // selectOption.
  await page.locator("#task-goal").click();
  await page.getByRole("option", { name: goalName, exact: true }).click();
  await taskDialog.getByRole("button", { name: "Create task" }).click();

  // 3. Open the "All" view (shows the task regardless of which date bucket it
  //    landed in) and complete it, matching by its unique name. Wait for the
  //    completion Server Action to COMMIT before reading /goals: completion runs
  //    in a transition, so navigating away too early would race the write.
  // The filters default to showing everything, so the undated task is
  // visible without switching views.
  const taskCard = page.getByTestId("task-card").filter({ hasText: taskName });
  await expect(taskCard).toBeVisible();
  const completeDone = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes("/tasks"),
  );
  // The completion control is a circular checkbox (role="checkbox").
  await taskCard.getByRole("checkbox", { name: `Complete ${taskName}` }).click();
  await completeDone;

  // 4. The goal's derived progress now reflects the completed task: 1/1 = 100%.
  await page.goto("/goals");
  await expect(goalCard()).toContainText("100%");
  await expect(goalCard()).toContainText("1/1");

  // Cleanup: archive the goal so the test is repeatable.
  await goalCard().getByRole("button", { name: `Archive ${goalName}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.getByRole("heading", { name: goalName })).toHaveCount(0);
});

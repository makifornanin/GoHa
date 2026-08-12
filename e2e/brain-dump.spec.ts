import { expect, test } from "@playwright/test";

/**
 * Capture a thought, convert it to a Task, and confirm both sides of the atomic
 * conversion: the Task now exists, and the source item is marked converted.
 */
test("capture a brain dump item and convert it to a task", async ({ page }) => {
  const content = `E2E dump ${Date.now()}`;

  const isBrainDumpAction = (url: string) =>
    (res: import("@playwright/test").Response) =>
      res.request().method() === "POST" && res.url().includes(url);

  await page.goto("/brain-dump");

  // Capture. The item renders OPTIMISTICALLY with a placeholder id until the
  // Server Action commits and revalidates, so wait for that POST to finish, then
  // reload so the item is rendered from the DB with its real id before we convert.
  await page.getByLabel("Capture a thought").fill(content);
  const captureDone = page.waitForResponse(isBrainDumpAction("/brain-dump"));
  await page.getByRole("button", { name: "Pin it" }).click();
  await captureDone;
  await page.reload();

  const item = page.getByTestId("brain-dump-item").filter({ hasText: content });
  await expect(item).toBeVisible();

  // Convert to a Task, waiting for that Server Action to commit before navigating
  // away (otherwise the in-flight write would be aborted by the navigation).
  const convertDone = page.waitForResponse(isBrainDumpAction("/brain-dump"));
  await item.getByRole("button", { name: "To Task" }).click();
  await convertDone;

  // The source item is now converted (confirmed by the server).
  await page.getByRole("radio", { name: /Converted/ }).click();
  await expect(
    page.getByTestId("brain-dump-item").filter({ hasText: content }),
  ).toContainText("→ Task");

  // The Task exists in To-dos (filters default to showing everything). The
  // card's title is a BUTTON, not a heading: it opens the task's detail panel.
  await page.goto("/tasks");
  await expect(page.getByRole("button", { name: content, exact: true })).toBeVisible({
    timeout: 15_000,
  });
});

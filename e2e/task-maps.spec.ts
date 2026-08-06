import { expect, test, type Locator } from "@playwright/test";

/**
 * Reliable persistence guarantee (CLAUDE.md section 7, Phase 11): a Task Map
 * survives a full reload from PostgreSQL. Create a map, add two nodes, connect
 * them, move one, reload, and confirm the moved node's position and the edge
 * both came back.
 *
 * A React Flow node carries its own flow-coordinate position in the
 * `.react-flow__node` element's `transform: translate(x, y)`, independent of the
 * viewport pan/zoom. So comparing that transform before and after a reload is a
 * direct check that the position round-tripped through the database.
 */

async function centerOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Expected element to be visible for a drag.");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function parseTranslate(transform: string): { x: number; y: number } | null {
  const match = transform.match(/translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

test("a task map persists node positions and edges across a reload", async ({ page }) => {
  const mapName = `E2E Map ${Date.now()}`;

  await page.goto("/task-maps");

  // 1. Create a map. Works from the empty state ("New map" button) or the
  //    explorer "+" (also labelled "New map").
  await page.getByRole("button", { name: "New map" }).first().click();
  const createDialog = page.getByRole("dialog");
  await createDialog.getByLabel("Name").fill(mapName);
  await createDialog.getByRole("button", { name: "Create map" }).click();

  // The canvas mounts (dynamically imported, client-only). Wait for the NEW
  // map's header specifically: if another map was already open, `.react-flow`
  // is visible immediately and the node clicks would race the canvas swap.
  await expect(page.getByRole("heading", { name: mapName })).toBeVisible();
  await expect(page.locator(".react-flow")).toBeVisible();
  await expect(page.locator(".react-flow__pane")).toBeVisible();

  // 2. Add two nodes of different types so they are distinguishable by text.
  //    `exact` avoids colliding with the app header's "Add Task" button.
  await page.getByRole("button", { name: "Task", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);

  // Deselect so the inspector panel does not sit over the canvas.
  await page.locator(".react-flow__pane").click({ position: { x: 24, y: 24 } });

  const taskNode = page.locator(".react-flow__node").filter({ hasText: "Task" });
  const noteNode = page.locator(".react-flow__node").filter({ hasText: "Note" });

  // 3. Move the Note node clear of the Task node (this is also the "move one"
  //    step whose final position we verify below).
  const from = await centerOf(noteNode);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 240, from.y + 200, { steps: 12 });
  await page.mouse.up();

  // 4. Connect Task (source handle, bottom) -> Note (target handle, top).
  const source = await centerOf(taskNode.locator(".react-flow__handle.source"));
  const target = await centerOf(noteNode.locator(".react-flow__handle.target"));
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 16 });
  await page.mouse.up();

  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  // Let the debounced position save (and the edge write) flush.
  await page.waitForTimeout(900);
  const before = parseTranslate(
    await noteNode.evaluate((el) => (el as HTMLElement).style.transform),
  );
  expect(before).not.toBeNull();

  // 5. Reload: the exact map state must be restored from PostgreSQL.
  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  const after = parseTranslate(
    await page
      .locator(".react-flow__node")
      .filter({ hasText: "Note" })
      .evaluate((el) => (el as HTMLElement).style.transform),
  );
  expect(after).not.toBeNull();

  if (before && after) {
    expect(Math.abs(after.x - before.x)).toBeLessThan(1.5);
    expect(Math.abs(after.y - before.y)).toBeLessThan(1.5);
  }

  // Cleanup: delete the map so the test is repeatable.
  await page.getByRole("button", { name: "Delete" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete map" }).click();
  await expect(page.getByRole("heading", { name: mapName })).toHaveCount(0);
});

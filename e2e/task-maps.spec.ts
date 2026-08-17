import { expect, test, type Locator, type Page } from "@playwright/test";

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

/**
 * Drag a connection between two nodes' handles.
 *
 * React Flow starts a connection on `pointerdown` and only tracks it from the
 * NEXT pointer event, so firing down-and-move in the same tick occasionally
 * dropped the gesture and produced zero edges. Hovering first, pausing after
 * the press, and moving through an intermediate point makes the drag land every
 * time. Same reason for the pause before release: the connection is committed
 * on `pointerup` against the last hovered handle.
 */
async function connect(page: Page, source: Locator, target: Locator) {
  // Fit first, then measure. Handle coordinates are only meaningful while both
  // nodes are actually on the canvas, and a node dragged near an edge can put
  // its handle outside it. Fitting removes every assumption about window size,
  // and it is the same control a user has ("Fit View" in the canvas controls).
  await page.getByRole("button", { name: "Fit View" }).click();
  await page.waitForTimeout(500);

  const from = await centerOf(source.locator(".react-flow__handle.source"));
  const to = await centerOf(target.locator(".react-flow__handle.target"));
  await page.mouse.move(from.x, from.y);
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 10 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.waitForTimeout(120);
  await page.mouse.up();
}

/**
 * Move a node to a spot that is guaranteed to stay inside the visible canvas.
 *
 * The old version nudged by a fixed +240/+200. At Playwright's default 1280x720
 * the canvas is only ~678x457, so that pushed the node (and the connect handle
 * on its edge) off the canvas entirely, and the connection drag that followed
 * aimed at a point outside it. That is what made these tests flaky. Clamping the
 * destination to the canvas keeps the gesture meaningful at any window size.
 */
async function dragNodeInsideCanvas(page: Page, node: Locator, wantDx: number, wantDy: number) {
  const canvas = await page.locator(".react-flow").boundingBox();
  const box = await node.boundingBox();
  if (!canvas || !box) throw new Error("Expected the canvas and node to be visible.");
  const margin = 24;
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const maxX = canvas.x + canvas.width - box.width / 2 - margin;
  const minX = canvas.x + box.width / 2 + margin;
  const maxY = canvas.y + canvas.height - box.height / 2 - margin;
  const minY = canvas.y + box.height / 2 + margin;
  const to = {
    x: Math.min(Math.max(from.x + wantDx, minX), maxX),
    y: Math.min(Math.max(from.y + wantDy, minY), maxY),
  };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(200);
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
  await expect(page.getByRole("heading", { name: mapName })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".react-flow")).toBeVisible();
  await expect(page.locator(".react-flow__pane")).toBeVisible();

  // 2. Add two nodes of different types so they are distinguishable by text.
  //    The seven node types live behind the "Add node" menu.
  await page.getByRole("button", { name: "Add node" }).click();
  await page.getByRole("button", { name: "Add Task node" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
  await page.getByRole("button", { name: "Add node" }).click();
  await page.getByRole("button", { name: "Add Note node" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);

  // Deselect so the inspector panel does not sit over the canvas.
  await page.locator(".react-flow__pane").click({ position: { x: 24, y: 24 } });

  const taskNode = page.locator(".react-flow__node").filter({ hasText: "Task" });
  const noteNode = page.locator(".react-flow__node").filter({ hasText: "Note" });

  // 3. Move the Note node clear of the Task node (this is also the "move one"
  //    step whose final position we verify below).
  await dragNodeInsideCanvas(page, noteNode, 240, 200);

  // 4. Connect Task (source handle, bottom) -> Note (target handle, top).
  await connect(page, taskNode, noteNode);

  // Generous: the first `addEdgeAction` call of a run cold-compiles under
  // `next dev`, and the edge only renders once the action resolves.
  await expect(page.locator(".react-flow__edge")).toHaveCount(1, { timeout: 20_000 });

  // Let the debounced position save (and the edge write) flush.
  await page.waitForTimeout(900);
  const before = parseTranslate(
    await noteNode.evaluate((el) => (el as HTMLElement).style.transform),
  );
  expect(before).not.toBeNull();

  // 5. Reload: the exact map state must be restored from PostgreSQL.
  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  // Generous: the first `addEdgeAction` call of a run cold-compiles under
  // `next dev`, and the edge only renders once the action resolves.
  await expect(page.locator(".react-flow__edge")).toHaveCount(1, { timeout: 20_000 });

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

/**
 * A node's note is content, not decoration: it has to render on the canvas and
 * survive a reload. This is the gap the Note node type had before, where the
 * type existed but there was nowhere to write the note.
 */
test("a node's note is saved, shown on the canvas, and survives a reload", async ({ page }) => {
  const mapName = `E2E Note Map ${Date.now()}`;
  const noteText = "Check the contract before starting.";

  await page.goto("/task-maps");
  await page.getByRole("button", { name: "New map" }).first().click();
  const createDialog = page.getByRole("dialog");
  await createDialog.getByLabel("Name").fill(mapName);
  await createDialog.getByRole("button", { name: "Create map" }).click();

  // Generous: creating a map is a server action plus a soft navigation, and the
  // previous map's canvas stays mounted until the new render lands. Waiting for
  // the NEW map's heading is what proves the toolbar now belongs to this map.
  await expect(page.getByRole("heading", { name: mapName })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".react-flow__pane")).toBeVisible();

  // Adding a node selects it, so the inspector is already open.
  await page.getByRole("button", { name: "Add node" }).click();
  await page.getByRole("button", { name: "Add Blocker node" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);

  const inspector = page.getByRole("complementary").filter({ hasText: "Edit node" });
  await inspector.getByLabel("Label").fill("Waiting on the client");
  await inspector.getByRole("textbox", { name: /Note/ }).fill(noteText);
  await inspector.getByRole("button", { name: "Save" }).click();

  // The note is the node's body, so it must be legible on the canvas itself.
  await expect(page.locator(".react-flow__node").getByText(noteText)).toBeVisible();

  await page.reload();
  await expect(page.locator(".react-flow__node").getByText(noteText)).toBeVisible();

  await page.getByRole("button", { name: "Delete" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete map" }).click();
  await expect(page.getByRole("heading", { name: mapName })).toHaveCount(0);
});

/**
 * "Tidy up" is what makes a map with thirty nodes usable. It has to reposition
 * nodes AND persist that, so the arrangement is still there after a reload.
 */
test("tidy up arranges the map by its connections and persists", async ({ page }) => {
  const mapName = `E2E Tidy Map ${Date.now()}`;

  await page.goto("/task-maps");
  await page.getByRole("button", { name: "New map" }).first().click();
  const createDialog = page.getByRole("dialog");
  await createDialog.getByLabel("Name").fill(mapName);
  await createDialog.getByRole("button", { name: "Create map" }).click();

  // Generous: creating a map is a server action plus a soft navigation, and the
  // previous map's canvas stays mounted until the new render lands. Waiting for
  // the NEW map's heading is what proves the toolbar now belongs to this map.
  await expect(page.getByRole("heading", { name: mapName })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".react-flow__pane")).toBeVisible();

  await page.getByRole("button", { name: "Add node" }).click();
  await page.getByRole("button", { name: "Add Task node" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
  await page.getByRole("button", { name: "Add node" }).click();
  await page.getByRole("button", { name: "Add Milestone node" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);

  await page.locator(".react-flow__pane").click({ position: { x: 24, y: 24 } });

  const taskNode = page.locator(".react-flow__node").filter({ hasText: "Task" });
  const milestoneNode = page.locator(".react-flow__node").filter({ hasText: "Milestone" });

  // New nodes land near the centre with only a little jitter, so they overlap.
  // Pull them apart first or the connect drag starts on the wrong node's handle.
  await dragNodeInsideCanvas(page, milestoneNode, 260, 220);

  // Connect Task -> Milestone, so the layout has a direction to follow.
  await connect(page, taskNode, milestoneNode);
  // Generous: the first `addEdgeAction` call of a run cold-compiles under
  // `next dev`, and the edge only renders once the action resolves.
  await expect(page.locator(".react-flow__edge")).toHaveCount(1, { timeout: 20_000 });

  await page.getByRole("button", { name: "Tidy up" }).click();
  await page.waitForTimeout(900);

  const readTranslate = async (node: Locator) =>
    parseTranslate(await node.evaluate((el) => (el as HTMLElement).style.transform));

  const tidiedTask = await readTranslate(taskNode);
  const tidiedMilestone = await readTranslate(milestoneNode);
  expect(tidiedTask).not.toBeNull();
  expect(tidiedMilestone).not.toBeNull();

  if (tidiedTask && tidiedMilestone) {
    // The source of the edge must end up above its target, and on the same column.
    expect(tidiedMilestone.y).toBeGreaterThan(tidiedTask.y);
    expect(Math.abs(tidiedMilestone.x - tidiedTask.x)).toBeLessThan(1.5);
  }

  await page.reload();
  const afterTask = await readTranslate(page.locator(".react-flow__node").filter({ hasText: "Task" }));
  if (tidiedTask && afterTask) {
    expect(Math.abs(afterTask.x - tidiedTask.x)).toBeLessThan(1.5);
    expect(Math.abs(afterTask.y - tidiedTask.y)).toBeLessThan(1.5);
  }

  await page.getByRole("button", { name: "Delete" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete map" }).click();
  await expect(page.getByRole("heading", { name: mapName })).toHaveCount(0);
});

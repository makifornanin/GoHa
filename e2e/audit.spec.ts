import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

/**
 * Full-app audit. Drives every screen and the primary interaction on each,
 * collecting console errors, uncaught exceptions, failed requests, and
 * navigation timings. Reports everything it finds instead of stopping at the
 * first failure, so one run surfaces the whole bug list.
 *
 * Runs against the isolated harness account (see scripts/test-account.mts), so
 * it never reads or writes the real owner's data.
 */

type Problem = { screen: string; kind: string; detail: string };
const problems: Problem[] = [];
const timings: { screen: string; ms: number }[] = [];

/** Browser noise that is not an app defect. */
const IGNORED = [
  /Download the React DevTools/i,
  /favicon/i,
  /\[Fast Refresh\]/i,
  /Turbopack/i,
];

function watch(page: Page, screen: string) {
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error" && msg.type() !== "warning") return;
    const text = msg.text();
    if (IGNORED.some((re) => re.test(text))) return;
    problems.push({ screen, kind: `console.${msg.type()}`, detail: text.slice(0, 300) });
  });
  page.on("pageerror", (err) => {
    problems.push({ screen, kind: "uncaught", detail: String(err.message).slice(0, 300) });
  });
  page.on("requestfailed", (req) => {
    const failure = req.failure()?.errorText ?? "";
    if (/ERR_ABORTED/.test(failure)) return;
    problems.push({ screen, kind: "requestfailed", detail: `${req.url().slice(0, 120)} ${failure}` });
  });
  page.on("response", (res) => {
    if (res.status() >= 500) {
      problems.push({ screen, kind: `http${res.status()}`, detail: res.url().slice(0, 160) });
    }
  });
}

async function visit(page: Page, path: string, screen: string) {
  watch(page, screen);
  const start = Date.now();
  await page.goto(path, { waitUntil: "networkidle" });
  timings.push({ screen, ms: Date.now() - start });
}

const ROUTES: [string, string][] = [
  ["/today", "Today"],
  ["/tasks", "Tasks"],
  ["/goals", "Goals"],
  ["/life-areas", "Life Areas"],
  ["/habits", "Habits"],
  ["/focus", "Focus"],
  ["/brain-dump", "Brain Dump"],
  ["/task-maps", "Task Maps"],
  ["/calendar", "Calendar"],
  ["/review", "Review"],
  ["/progress", "Progress"],
  ["/settings", "Settings"],
];

test.describe.configure({ mode: "serial" });

test("every route loads without errors", async ({ page }) => {
  for (const [path, screen] of ROUTES) {
    await visit(page, path, screen);
    // The shell must render; a blank page means a crash.
    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });
  }
});

test("Today: quick-add creates a task that is immediately visible", async ({ page }) => {
  await visit(page, "/today", "Today/quick-add");

  const title = `Audit today ${Date.now()}`;
  const input = page.getByLabel("Quick add task for today");
  await expect(input).toBeVisible();
  await input.fill(title);
  await input.press("Enter");

  // It must appear on the very screen it was added from.
  await expect(page.getByText(title, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
});

test("Today: completing a task works and persists", async ({ page }) => {
  await visit(page, "/today", "Today/complete");

  const title = `Audit complete ${Date.now()}`;
  const input = page.getByLabel("Quick add task for today");
  await input.fill(title);
  await input.press("Enter");
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 });

  // Let the list settle: rows animate (layout) for ~300ms after the add
  // revalidates, and a click landing mid-reflow can be dropped.
  const box = page.getByRole("checkbox", { name: `Complete ${title}` });
  await expect(box).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
  await box.click();

  // A ticked task must STAY on screen (struck through, undoable), not vanish.
  const reopen = page.getByRole("checkbox", { name: `Reopen ${title}` });
  await expect(reopen).toBeVisible({ timeout: 15_000 });
  await expect(reopen).toHaveAttribute("aria-checked", "true");

  // Survives a reload (i.e. it really persisted).
  await page.reload({ waitUntil: "networkidle" });
  await expect(
    page.getByRole("checkbox", { name: `Reopen ${title}` }),
  ).toBeVisible({ timeout: 15_000 });
});

test("Shell: Add Task button actually opens the create form", async ({ page }) => {
  await visit(page, "/today", "Shell/add-task");
  await page.getByRole("banner").getByRole("button", { name: "Add Task" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("dialog").getByText("New task")).toBeVisible();
});

test("Tasks: an undated task is never hidden after creation", async ({ page }) => {
  await visit(page, "/tasks", "Tasks/undated");

  const title = `Audit undated ${Date.now()}`;
  await page.getByTestId("new-task").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByLabel("Title").fill(title);
  // Deliberately clear any default date so the task is undated.
  const scheduled = dialog.getByLabel("Scheduled for", { exact: false });
  if (await scheduled.count()) await scheduled.fill("");
  await dialog.getByRole("button", { name: "Create task" }).click();

  await expect(dialog).toBeHidden({ timeout: 15_000 });
  // The whole point of the fix: the task must be on screen, not silently in Inbox.
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 });
});

test("Life Areas: create one", async ({ page }) => {
  await visit(page, "/life-areas", "Life Areas/create");

  const name = `Audit area ${Date.now()}`;
  await page.getByTestId("new-life-area").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create life area" }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 15_000 });
});

test("Goals: create one", async ({ page }) => {
  await visit(page, "/goals", "Goals/create");

  const title = `Audit goal ${Date.now()}`;
  await page.getByTestId("new-goal").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByRole("button", { name: "Create goal" }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 });
});

test("Habits: create one", async ({ page }) => {
  await visit(page, "/habits", "Habits/create");

  const name = `Audit habit ${Date.now()}`;
  await page.getByTestId("new-habit").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create habit" }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 15_000 });
});

test("Brain Dump: capture an item", async ({ page }) => {
  await visit(page, "/brain-dump", "Brain Dump/capture");

  const text = `Audit thought ${Date.now()}`;
  await page.getByLabel("Capture a thought").fill(text);
  await page.getByRole("button", { name: "Dump It" }).click();
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 15_000 });
});

test("Focus: start and discard a session", async ({ page }) => {
  await visit(page, "/focus", "Focus/session");

  await page.getByRole("button", { name: "Start Focus Session" }).click();
  // Active timer chrome should appear.
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Discard session" }).click();
  await expect(page.getByRole("button", { name: "Start Focus Session" })).toBeVisible({
    timeout: 20_000,
  });
});

test("Settings: theme switch persists", async ({ page }) => {
  await visit(page, "/settings", "Settings/theme");
  await page.getByText("Dark", { exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/, { timeout: 10_000 });
});

test("AUDIT REPORT", async () => {
  console.log("\n================ NAVIGATION TIMINGS ================");
  for (const t of [...timings].sort((a, b) => b.ms - a.ms)) {
    const flag = t.ms > 3000 ? "  <-- SLOW" : "";
    console.log(`  ${String(t.ms).padStart(6)}ms  ${t.screen}${flag}`);
  }

  console.log("\n================ PROBLEMS FOUND ====================");
  if (problems.length === 0) {
    console.log("  none");
  } else {
    const seen = new Set<string>();
    for (const p of problems) {
      const key = `${p.kind}|${p.detail}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`  [${p.screen}] ${p.kind}\n      ${p.detail}`);
    }
  }
  console.log("====================================================\n");
});

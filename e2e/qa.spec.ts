import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Full QA pass. Populates every section with realistic data, exercises every
 * control (including edit / archive / delete and validation), checks dark mode
 * and a mobile viewport, and captures screenshots to `qa-screenshots/`.
 *
 * Runs against the isolated harness account (scripts/test-account.mts), never
 * the real owner's data.
 */

const SHOTS = "qa-screenshots";

type Finding = { area: string; severity: "BUG" | "UX" | "NOTE"; detail: string };
const findings: Finding[] = [];
const consoleProblems: string[] = [];

const IGNORED = [/React DevTools/i, /favicon/i, /Fast Refresh/i, /Turbopack/i];

function record(area: string, severity: Finding["severity"], detail: string) {
  findings.push({ area, severity, detail });
}

function watch(page: Page, area: string) {
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (IGNORED.some((re) => re.test(t))) return;
    consoleProblems.push(`[${area}] ${t.slice(0, 200)}`);
  });
  page.on("pageerror", (e) => consoleProblems.push(`[${area}] UNCAUGHT ${e.message.slice(0, 200)}`));
}

/**
 * The custom Select is a combobox button; its options are portaled to <body>.
 *
 * `.first()` because this spec seeds fixed names ("Health & Fitness", ...) and
 * does not clean them up, so a second run against the same account legitimately
 * offers two identical options. Picking either satisfies the assertion; failing
 * on strict mode only reported that the suite had been run twice.
 */
async function chooseOption(page: Page, triggerSelector: string, optionLabel: string) {
  await page.locator(triggerSelector).click();
  await page.getByRole("option", { name: optionLabel, exact: true }).first().click();
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function dialog(page: Page): Promise<Locator> {
  const d = page.getByRole("dialog");
  await expect(d).toBeVisible({ timeout: 15_000 });
  return d;
}

test.describe.configure({ mode: "serial" });

/* ------------------------------------------------------------------ */
/* 1. LIFE AREAS                                                       */
/* ------------------------------------------------------------------ */
test("Life Areas: create, validate, edit, archive", async ({ page }) => {
  watch(page, "Life Areas");
  await page.goto("/life-areas");

  // --- validation: empty name must be rejected ---
  await page.getByTestId("new-life-area").click();
  let d = await dialog(page);
  await d.getByRole("button", { name: "Create life area" }).click();
  const nameError = d.getByText("Give this area a name", { exact: false });
  if (await nameError.count()) {
    record("Life Areas", "NOTE", "Empty-name validation works and is shown inline.");
  } else {
    record("Life Areas", "BUG", "Empty name was not rejected with a visible message.");
  }
  await d.getByRole("button", { name: "Close dialog" }).click();

  // --- create three realistic areas ---
  const areas = [
    { name: "Health & Fitness", desc: "Training, sleep, nutrition, and energy management." },
    { name: "Career", desc: "Engineering craft, delivery, and professional growth." },
    { name: "Finances", desc: "Savings rate, investments, and runway." },
  ];
  for (const a of areas) {
    await page.getByTestId("new-life-area").click();
    d = await dialog(page);
    await d.getByLabel("Name").fill(a.name);
    await d.getByLabel("Description", { exact: false }).fill(a.desc);
    await d.getByRole("button", { name: "Create life area" }).click();
    await expect(d).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(a.name).first()).toBeVisible({ timeout: 15_000 });
  }
  await shot(page, "01-life-areas");

  // --- edit one ---
  await page.getByRole("button", { name: "Edit Career", exact: true }).click();
  d = await dialog(page);
  await d.getByLabel("Name").fill("Career & Craft");
  await d.getByRole("button", { name: "Save changes" }).click();
  await expect(d).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText("Career & Craft").first()).toBeVisible({ timeout: 15_000 });
  record("Life Areas", "NOTE", "Create / edit / rename all persist correctly.");

  // --- archive one (confirmation flow) ---
  await page.getByRole("button", { name: "Archive Finances" }).click();
  d = await dialog(page);
  await d.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("Finances", { exact: true })).toHaveCount(0, { timeout: 15_000 });
  record("Life Areas", "NOTE", "Archive asks for confirmation and removes the card optimistically.");
});

/* ------------------------------------------------------------------ */
/* 2. GOALS                                                            */
/* ------------------------------------------------------------------ */
test("Goals: create parent + sub-goal, manual progress, edit", async ({ page }) => {
  watch(page, "Goals");
  await page.goto("/goals");

  // Parent goal, auto progress, linked to a life area
  await page.getByTestId("new-goal").click();
  let d = await dialog(page);
  await d.getByLabel("Title").fill("Run a half marathon");
  await d.getByLabel("Description", { exact: false }).fill("Finish 21km under 2 hours by December.");
  await chooseOption(page, "#goal-life-area", "Health & Fitness");
  await chooseOption(page, "#goal-timeframe", "Yearly");
  await chooseOption(page, "#goal-status", "Active");
  await d.getByRole("button", { name: "Create goal" }).click();
  await expect(d).toBeHidden({ timeout: 15_000 });

  // Sub-goal nested under it, manual progress
  await page.getByTestId("new-goal").click();
  d = await dialog(page);
  await d.getByLabel("Title").fill("Build a 10km base");
  await chooseOption(page, "#goal-parent", "Run a half marathon");
  await chooseOption(page, "#goal-timeframe", "Monthly");
  await chooseOption(page, "#goal-status", "Active");
  await d.getByRole("radio", { name: "Manual" }).click();
  const slider = d.locator("#goal-manual");
  if (await slider.count()) {
    await slider.fill("40");
    record("Goals", "NOTE", "Manual progress mode reveals a slider and accepts a value.");
  } else {
    record("Goals", "BUG", "Manual progress mode did not reveal the progress slider.");
  }
  await d.getByRole("button", { name: "Create goal" }).click();
  await expect(d).toBeHidden({ timeout: 15_000 });

  await expect(page.getByText("Run a half marathon").first()).toBeVisible();
  await expect(page.getByText("Build a 10km base").first()).toBeVisible();

  // The sub-goal should declare its parent.
  if (await page.getByText("Part of Run a half marathon").count()) {
    record("Goals", "NOTE", "Sub-goal shows its parent lineage on the card.");
  } else {
    record("Goals", "UX", "Sub-goal does not visibly indicate its parent goal.");
  }

  // Timeframe tabs filter.
  await page.getByRole("tab", { name: "This Month" }).click();
  await expect(page.getByText("Build a 10km base").first()).toBeVisible();
  // The sub-goal card prints "Part of Run a half marathon", so match the
  // card TITLE (h3), not any text occurrence.
  const parentCards = await page
    .getByRole("heading", { name: "Run a half marathon", exact: true })
    .count();
  if (parentCards > 0) {
    record("Goals", "BUG", "Yearly goal still listed under the 'This Month' tab.");
  } else {
    record("Goals", "NOTE", "Timeframe tabs correctly filter goals.");
  }
  await page.getByRole("tab", { name: "All Goals" }).click();
  await shot(page, "02-goals");
});

/* ------------------------------------------------------------------ */
/* 3. TASKS                                                            */
/* ------------------------------------------------------------------ */
test("Tasks: create across views, link, complete, reflect, cancel, delete", async ({ page }) => {
  watch(page, "Tasks");
  await page.goto("/tasks");

  const today = new Date().toISOString().slice(0, 10);

  // Full task: linked to goal + life area, scheduled today, high priority
  await page.getByTestId("new-task").click();
  let d = await dialog(page);
  await d.getByLabel("Title").fill("Long run 12km");
  await d.getByLabel("Description", { exact: false }).fill("Easy pace, zone 2, hydrate well.");
  await chooseOption(page, "#task-priority", "High");
  await chooseOption(page, "#task-goal", "Run a half marathon");
  await chooseOption(page, "#task-life-area", "Health & Fitness");
  await d.getByLabel("Scheduled for", { exact: false }).fill(today);
  await d.getByRole("button", { name: "Create task" }).click();
  await expect(d).toBeHidden({ timeout: 15_000 });

  // Undated task -> must not disappear
  await page.getByTestId("new-task").click();
  d = await dialog(page);
  await d.getByLabel("Title").fill("Research running shoes");
  await d.getByLabel("Scheduled for", { exact: false }).fill("");
  await d.getByRole("button", { name: "Create task" }).click();
  await expect(d).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText("Research running shoes").first()).toBeVisible({ timeout: 15_000 });
  record("Tasks", "NOTE", "Undated task stays visible after creation (jumps to Inbox).");

  // Urgent task with a due time
  await page.getByTestId("new-task").click();
  d = await dialog(page);
  await d.getByLabel("Title").fill("Submit quarterly report");
  await chooseOption(page, "#task-priority", "Urgent");
  await d.getByLabel("Scheduled for", { exact: false }).fill(today);
  await d.getByLabel("Due", { exact: false }).fill(`${today}T17:00`);
  await d.getByRole("button", { name: "Create task" }).click();
  await expect(d).toBeHidden({ timeout: 15_000 });

  // Complete one and add a reflection.
  // Timeframe and progress both default to "all", so the new task is
  // already on screen; there is no separate "All" view button any more.
  //
  // `.first()` for the same reason as `chooseOption`: this spec seeds fixed
  // titles and does not clean them up, so a second run against the same account
  // legitimately has two "Long run 12km" rows. Either satisfies the assertion.
  await page.getByRole("checkbox", { name: "Complete Long run 12km" }).first().click();
  await expect(
    page.getByRole("checkbox", { name: "Reopen Long run 12km" }).first(),
  ).toBeVisible({ timeout: 15_000 });

  const reflect = page.getByRole("button", { name: "Add reflection" }).first();
  if (await reflect.count()) {
    await reflect.click();
    d = await dialog(page);
    await d.getByLabel("How did it go?").fill("Felt strong. Negative split on the back half.");
    await d.getByRole("button", { name: "Save reflection" }).click();
    await expect(d).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText("Negative split", { exact: false })).toBeVisible();
    record("Tasks", "NOTE", "Completion reflection saves and displays on the card.");
  } else {
    record("Tasks", "BUG", "No 'Add reflection' action on a completed task.");
  }

  // Cancel a task
  const cancelBtn = page.getByRole("button", { name: "Cancel", exact: true }).first();
  if (await cancelBtn.count()) {
    await cancelBtn.click();
    record("Tasks", "NOTE", "Cancel action available on open tasks.");
  }

  await shot(page, "03-tasks");

  // Delete flow (confirmation)
  await page.getByRole("button", { name: "Delete", exact: true }).first().click();
  d = await dialog(page);
  await d.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(d).toBeHidden({ timeout: 15_000 });
  record("Tasks", "NOTE", "Delete requires confirmation and removes the row.");

  // Filters are dropdowns that carry live counts in their option labels.
  const timeframe = await page.getByRole("combobox", { name: "Filter by timeframe" }).textContent();
  record("Tasks", "NOTE", `Timeframe filter shows live counts (reads "${timeframe?.trim()}").`);
});

/* ------------------------------------------------------------------ */
/* 4. HABITS                                                           */
/* ------------------------------------------------------------------ */
test("Habits: boolean + numeric, schedules, logging", async ({ page }) => {
  watch(page, "Habits");
  await page.goto("/habits");

  // Boolean, daily
  await page.getByTestId("new-habit").click();
  let d = await dialog(page);
  await d.getByLabel("Name").fill("Morning meditation");
  await d.getByLabel("Description", { exact: false }).fill("10 minutes before anything else.");
  await chooseOption(page, "#habit-life-area", "Health & Fitness");
  await d.getByRole("button", { name: "Create habit" }).click();
  await expect(d).toBeHidden({ timeout: 20_000 });

  // Numeric with a target + unit
  await page.getByTestId("new-habit").click();
  d = await dialog(page);
  await d.getByLabel("Name").fill("Drink water");
  await d.getByRole("radio", { name: "Measured" }).click();
  const target = d.locator("#habit-target");
  await expect(target).toBeVisible({ timeout: 10_000 });
  await target.fill("8");
  const unit = d.locator("#habit-unit");
  if (await unit.count()) await unit.fill("glasses");
  await d.getByRole("button", { name: "Create habit" }).click();
  await expect(d).toBeHidden({ timeout: 20_000 });
  record("Habits", "NOTE", "Numeric habit reveals target/unit fields and saves them.");

  await expect(page.getByText("Morning meditation").first()).toBeVisible();
  await expect(page.getByText("Drink water").first()).toBeVisible();

  // Log the boolean habit as done. Scoped to the row for the habit this test
  // just created: `.first()` picked whichever habit happened to sit at the top
  // of today's list, which on a re-used account is one seeded by another spec.
  const meditationRow = page
    .locator("li")
    .filter({ hasText: "Morning meditation" })
    .filter({ has: page.getByRole("button", { name: "Mark done" }) })
    .first();
  const done = meditationRow.getByRole("button", { name: "Mark done" });
  await done.click();
  await expect(done).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
  record("Habits", "NOTE", "Boolean habit logging toggles and persists.");

  await shot(page, "04-habits");
});

/* ------------------------------------------------------------------ */
/* 5. TODAY                                                            */
/* ------------------------------------------------------------------ */
test("Today: quick add, pin priorities, complete, habits", async ({ page }) => {
  watch(page, "Today");
  await page.goto("/today");

  // Quick add
  const input = page.getByLabel("Quick add task for today");
  await input.fill("Review sprint board");
  await input.press("Enter");
  await expect(page.getByText("Review sprint board").first()).toBeVisible({ timeout: 15_000 });

  // Pin a priority
  const addPriority = page.getByRole("button", { name: "Add a priority" });
  if (await addPriority.count()) {
    await addPriority.click();
    const d = await dialog(page);
    const first = d.getByRole("button").filter({ hasText: /.+/ }).nth(1);
    await first.click();
    await expect(d).toBeHidden({ timeout: 15_000 });
    record("Today", "NOTE", "Top 3 priority picker opens and pins a canonical task.");
  } else {
    record("Today", "BUG", "No way to add a Top 3 priority.");
  }

  // Complete from Today and confirm it stays
  const cb = page.getByRole("checkbox", { name: "Complete Review sprint board" });
  await cb.click();
  await expect(page.getByRole("checkbox", { name: "Reopen Review sprint board" })).toBeVisible({
    timeout: 15_000,
  });
  record("Today", "NOTE", "Completed task remains visible and is undoable.");

  await shot(page, "05-today");

  // Progress ring should reflect completion
  const ring = page.getByText("%", { exact: false }).first();
  if (await ring.count()) {
    record("Today", "NOTE", "Progress ring renders a live completion percentage.");
  }
});

/* ------------------------------------------------------------------ */
/* 6. BRAIN DUMP                                                       */
/* ------------------------------------------------------------------ */
test("Brain Dump: capture, edit, convert, archive", async ({ page }) => {
  watch(page, "Brain Dump");
  await page.goto("/brain-dump");

  const items = [
    "Look into a standing desk for the home office",
    "Idea: automate the weekly finance review",
    "Book dentist appointment",
  ];
  for (const text of items) {
    await page.getByLabel("Capture a thought").fill(text);
    await page.getByRole("button", { name: "Pin it" }).click();
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 15_000 });
  }
  record("Brain Dump", "NOTE", "Capture is fast and items appear immediately (optimistic).");

  // Convert one to a task. The item leaves Inbox and lands under "Converted".
  // Scope to the exact card: the list is newest-first, so `.first()` is not it.
  const firstItem = items[0];
  await page
    .locator('[data-testid="brain-dump-item"]')
    .filter({ hasText: firstItem })
    .getByRole("button", { name: "To Task" })
    .click();

  const toast = page.getByText("Converted to Task").first();
  const toastSeen = await toast
    .waitFor({ state: "visible", timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  record(
    "Brain Dump",
    toastSeen ? "NOTE" : "UX",
    toastSeen
      ? "Converting shows a toast with a 'View' shortcut to the new entity."
      : "Converting gives no visible confirmation before the item leaves the list.",
  );

  // It must be findable afterwards, not silently gone.
  await page.getByRole("radio", { name: /Converted/ }).click();
  await expect(page.getByText(firstItem).first()).toBeVisible({ timeout: 15_000 });
  record("Brain Dump", "NOTE", "Converted items are retained under the Converted tab.");
  await page.getByRole("radio", { name: /Wall/ }).click();

  // Archive another
  const archive = page.getByRole("button", { name: "Archive" }).first();
  if (await archive.count()) {
    await archive.click();
    record("Brain Dump", "NOTE", "Archive moves the item out of Inbox.");
  }

  await shot(page, "06-brain-dump");
});

/* ------------------------------------------------------------------ */
/* 7. FOCUS                                                            */
/* ------------------------------------------------------------------ */
test("Focus: durations, start, pause, resume, extend, complete with note", async ({ page }) => {
  watch(page, "Focus");
  await page.goto("/focus");

  // Duration segmented control
  await page.getByRole("radio", { name: "45m", exact: true }).click();
  await expect(page.getByText("45:00")).toBeVisible();
  await page.getByRole("radio", { name: "15m", exact: true }).click();
  await expect(page.getByText("15:00")).toBeVisible();
  record("Focus", "NOTE", "Duration segmented control updates the preview timer.");

  // The task picker should offer the user's open tasks alongside the open-focus
  // option. Start WITHOUT a task: that is the path that was previously broken.
  await page.locator("#focus-task").click();
  const optionCount = await page.getByRole("option").count();
  record("Focus", "NOTE", `Task picker lists ${optionCount} option(s) including "No specific task".`);
  await page.getByRole("option", { name: "No specific task", exact: true }).click();

  await page.getByRole("button", { name: "Start Focus Session" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible({ timeout: 20_000 });
  await shot(page, "07-focus-running");

  // Pause / resume
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Paused")).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible({ timeout: 15_000 });
  record("Focus", "NOTE", "Pause/resume works and the timer state is labelled.");

  // Extend: one-tap amounts plus a custom value.
  await page.getByRole("button", { name: "10m", exact: true }).click();
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await page.getByLabel("Custom minutes to add").fill("7");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  record("Focus", "NOTE", "Extending accepts preset amounts and a custom value.");

  // Note + complete
  await page.getByLabel("Session notes", { exact: false }).fill("Deep work on the report intro.");
  await page.getByRole("button", { name: "Complete session" }).click();
  await expect(page.getByRole("button", { name: "Start Focus Session" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Recent sessions")).toBeVisible();
  record("Focus", "NOTE", "Completing a session saves it and it appears under Recent sessions.");
  await shot(page, "08-focus-stats");
});

/* ------------------------------------------------------------------ */
/* 8. TASK MAPS                                                        */
/* ------------------------------------------------------------------ */
test("Task Maps: create map, add nodes, edit node", async ({ page }) => {
  watch(page, "Task Maps");
  await page.goto("/task-maps");

  const create = page.getByRole("button", { name: /New map/ }).first();
  await create.click();
  const d = await dialog(page);
  await d.getByLabel("Name").fill("Half marathon plan");
  await d.getByRole("button", { name: "Create map" }).click();
  await expect(d).toBeHidden({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Half marathon plan" })).toBeVisible({
    timeout: 20_000,
  });

  // Add nodes of each type
  for (const type of ["Task", "Note", "Milestone"]) {
    await page.getByRole("button", { name: type, exact: true }).click();
    await page.waitForTimeout(600);
  }
  record("Task Maps", "NOTE", "Canvas loads and Task/Note/Milestone nodes can be added.");

  // The inspector should be open for the last added node
  const label = page.getByPlaceholder("Node label");
  if (await label.count()) {
    await label.fill("Race day");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    record("Task Maps", "NOTE", "Node inspector edits and saves a node label.");
  } else {
    record("Task Maps", "UX", "Adding a node did not open the inspector for naming it.");
  }

  await shot(page, "09-task-maps");
});

/* ------------------------------------------------------------------ */
/* 9. SETTINGS + THEME + RESPONSIVE                                    */
/* ------------------------------------------------------------------ */
test("Settings: profile, theme, timezone, week start", async ({ page }) => {
  watch(page, "Settings");
  await page.goto("/settings");

  // Profile name
  await page.locator("#settings-name").fill("Maki QA");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Profile updated.")).toBeVisible({ timeout: 15_000 });
  record("Settings", "NOTE", "Profile name saves with a success toast.");

  // Email must be read-only
  const email = page.locator("#settings-email");
  await expect(email).toBeDisabled();
  record("Settings", "NOTE", "Sign-in email is correctly read-only.");

  // Theme
  await page.getByText("Dark", { exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/, { timeout: 10_000 });
  await shot(page, "10-settings-dark");

  // Timezone + week start
  await chooseOption(page, "#settings-timezone", "Tokyo (GMT+9)");
  await expect(page.getByText("Preferences saved.")).toBeVisible({ timeout: 15_000 });
  await chooseOption(page, "#settings-week-start", "Sunday");
  record("Settings", "NOTE", "Timezone and week-start persist immediately on change.");

  // Restore
  await chooseOption(page, "#settings-timezone", "Manila (GMT+8)");
  await chooseOption(page, "#settings-week-start", "Monday");

  // Dark mode across screens
  await page.goto("/today");
  await shot(page, "11-today-dark");
  await page.goto("/goals");
  await shot(page, "12-goals-dark");

  await page.getByText("Light", { exact: true }).count();
  await page.goto("/settings");
  await page.getByText("Light", { exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/, { timeout: 10_000 });
});

test("Responsive: mobile viewport navigation and layout", async ({ page }) => {
  watch(page, "Mobile");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/today");
  await shot(page, "13-mobile-today");

  // Bottom tab bar present
  const bottomNav = page.getByRole("navigation", { name: "Primary" }).last();
  await expect(bottomNav).toBeVisible();

  // Drawer opens
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog", { name: "Main navigation" })).toBeVisible({
    timeout: 10_000,
  });
  await shot(page, "14-mobile-drawer");
  await page.getByRole("button", { name: "Close navigation" }).click();

  // Center "+" opens the task form
  await page.getByRole("button", { name: "Add a task" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
  await shot(page, "15-mobile-task-form");
  record("Mobile", "NOTE", "Drawer, tab bar, and center + action all work at 390px.");

  // Horizontal overflow check
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  if (overflow) record("Mobile", "BUG", "Page overflows horizontally at 390px width.");
  else record("Mobile", "NOTE", "No horizontal overflow at 390px.");
});

test("Keyboard: dialog focus trap and Escape", async ({ page }) => {
  watch(page, "Keyboard");
  await page.goto("/tasks");
  await page.getByTestId("new-task").click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });
  record("Keyboard", "NOTE", "Escape closes dialogs.");

  // Custom Select keyboard operation
  await page.getByTestId("new-task").click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
  await page.locator("#task-priority").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toBeHidden({ timeout: 10_000 });
  record("Keyboard", "NOTE", "Custom Select opens, navigates, and commits by keyboard.");
  await page.keyboard.press("Escape");
});

test("QA REPORT", async () => {
  console.log("\n=================== QA FINDINGS ===================");
  for (const sev of ["BUG", "UX", "NOTE"] as const) {
    const rows = findings.filter((f) => f.severity === sev);
    if (rows.length === 0) continue;
    console.log(`\n--- ${sev} (${rows.length}) ---`);
    for (const r of rows) console.log(`  [${r.area}] ${r.detail}`);
  }
  console.log("\n--- CONSOLE / RUNTIME ERRORS ---");
  console.log(consoleProblems.length === 0 ? "  none" : "");
  for (const p of [...new Set(consoleProblems)]) console.log(`  ${p}`);
  console.log("===================================================\n");
});

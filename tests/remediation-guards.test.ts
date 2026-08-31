import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guards for the mistakes this codebase has repeated.
 *
 * Three separate rounds shipped a fix to the component that had been reported
 * while its siblings kept the old pattern: the date picker was replaced in the
 * task modal, found again in the task detail panel, and again in the goal form.
 * Each time the change was correct and the SWEEP was what was missing.
 *
 * These assert the sweep's conclusions, so a half-migration fails the suite
 * rather than waiting for someone to notice on a screen.
 *
 * They check source text, not rendered pixels, on purpose: contrast ratios and
 * hit-area sizes depend on layout, which jsdom does not do. Those are measured
 * in a real browser instead.
 */

const ROOT = process.cwd();
const EXTS = [".ts", ".tsx"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTS.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

const FILES = ["app", "components", "lib"].flatMap((d) => {
  try {
    return walk(join(ROOT, d));
  } catch {
    return [];
  }
});

/** Source lines that are not comments, so prose quoting a pattern is ignored. */
function codeLines(file: string): { line: string; n: number }[] {
  const out: { line: string; n: number }[] = [];
  let inBlock = false;
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .forEach((line, i) => {
      const t = line.trim();
      /*
       * The block check MUST come first.
       *
       * A JSDoc closes with a line whose trimmed form is `*​/`, which also
       * starts with `*`. With the startsWith test first, that line returned
       * early and `inBlock` was never cleared, so EVERY line after the first
       * JSDoc in a file was treated as comment and dropped. Guards asserting
       * that some code exists then passed or failed on an almost empty string.
       * Found when a new guard could not see an attribute that was plainly
       * there.
       */
      if (inBlock) {
        if (t.includes("*/")) inBlock = false;
        return;
      }
      if (t.startsWith("*") || t.startsWith("//")) return;
      if (/^\{?\/\*/.test(t)) {
        if (!t.includes("*/")) inBlock = true;
        return;
      }
      out.push({ line, n: i + 1 });
    });
  return out;
}

function findAll(pattern: RegExp, allow: string[] = []): string[] {
  const hits: string[] = [];
  for (const file of FILES) {
    const rel = relative(ROOT, file).split("\\").join("/");
    if (allow.includes(rel)) continue;
    for (const { line, n } of codeLines(file)) {
      if (pattern.test(line)) hits.push(`${rel}:${n}`);
    }
  }
  return hits;
}

describe("one date primitive, everywhere", () => {
  it("has no native date input outside the shared field", () => {
    // Goals kept one of these through two earlier rounds of exactly this work.
    expect(
      findAll(/type="(date|datetime-local)"/, [
        "components/ui/date-field.tsx",
        "components/ui/input.tsx",
      ]),
    ).toEqual([]);
  });

  it("has no native time input outside the shared field", () => {
    // Daily Rhythm is a real clock setting and legitimately keeps a time
    // control, but it goes through TimeField like everything else.
    expect(
      findAll(/type="time"/, ["components/ui/time-field.tsx", "components/ui/input.tsx"]),
    ).toEqual([]);
  });

  it("still offers the shared date field to both task surfaces and to goals", () => {
    for (const file of [
      "components/tasks/task-form-modal.tsx",
      "components/tasks/task-detail-panel.tsx",
      "components/goals/goal-form-modal.tsx",
    ]) {
      expect(readFileSync(join(ROOT, file), "utf8"), file).toContain("DateField");
    }
  });
});

describe("white text never sits on the accent blue", () => {
  it("uses the darker fill wherever white text sits on blue", () => {
    /*
     * `--blue` measures 4.02:1 against white in light and 3.65:1 in dark, both
     * short of AA for normal text. `--blue-fill` is the same hue at 5.65:1.
     * Icon-only circles are allowed to keep the accent: a graphic needs 3:1.
     */
    expect(
      findAll(/bg-blue(?![-/\w])[^"]*\btext-white\b/, [
        "components/shell/mobile-bottom-nav.tsx",
        "components/focus/focus-view.tsx",
        "components/goals/goals-view.tsx",
        "components/celebration.tsx",
        // The mobile "+" FAB. It is ICON-ONLY (aria-label plus a <Plus/>), so
        // the 3:1 graphic threshold applies and --blue clears it. It lived in
        // mobile-bottom-nav.tsx, which is exempt just above for this same
        // reason; the "+ Add" work moved it here, so the exemption moved too.
        "components/shell/add-menu.tsx",
      ]),
    ).toEqual([]);
  });
});

describe("the 44px rule is structural", () => {
  it("bakes the hit area into the shared button primitive", () => {
    // A sweep measured 52 controls under 44px across seven mobile screens.
    // Annotating call sites did not scale; the primitive carries it now.
    expect(readFileSync(join(ROOT, "components/ui/button.tsx"), "utf8")).toContain("touch-target");
  });

  it("bakes it into the segmented control too", () => {
    expect(readFileSync(join(ROOT, "components/ui/segmented-control.tsx"), "utf8")).toContain(
      "touch-target",
    );
  });

  it("only grows the target on coarse pointers, so desktop density is kept", () => {
    const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
    const block = css.slice(css.indexOf(".touch-target"));
    expect(block).toContain("@media (pointer: coarse)");
    // `max(100%, ...)` can only ever grow a target, never shrink one.
    expect(block).toContain("max(100%");
  });
});

describe("one primary create action in the chrome", () => {
  it("keeps a create button out of the global top bar", () => {
    /*
     * The sidebar's create button sits about 78px below that bar, so a second
     * one put two near-identical primary buttons in one viewport, and /tasks
     * added a third in its page header.
     */
    // Comments in that file explain the removal, so assert on CODE only.
    const code = codeLines(join(ROOT, "components/shell/app-header.tsx"))
      .map((l) => l.line)
      .join(String.fromCharCode(10));
    expect(code).not.toContain("AddMenu");
    expect(code).not.toContain("Add to-do");
  });

  it("keeps every deliberate alternative path", () => {
    /*
     * Same guarantee as before the "+ Add" work, restated in its terms: every
     * route to creating something still exists. The shell and the tab bar go
     * through the shared menu; the pages that are ABOUT one kind of record keep
     * their direct button, because a menu of one is a wasted click.
     */
    const paths: [string, string][] = [
      ["components/shell/app-sidebar.tsx", "AddMenu"],
      ["components/shell/mobile-bottom-nav.tsx", "AddMenuFab"],
      ["components/shell/command-palette.tsx", "addOptionsFor"],
      // The goals board uses a DIRECT button, not the shared menu: the
      // sidebar already carries a root-context Add a few pixels away, and
      // two identical menus in one viewport is the duplication this whole
      // rule exists to prevent.
      ["components/goals/goals-view.tsx", "Add goal"],
      ["components/goals/goal-detail-view.tsx", "AddMenu"],
      ["components/tasks/tasks-view.tsx", "Add to-do"],
      ["components/tasks/task-calendar.tsx", "Add a to-do on"],
    ];
    for (const [file, needle] of paths) {
      expect(readFileSync(join(ROOT, file), "utf8"), file).toContain(needle);
    }
  });

  it("still reopens the create form when the URL asks again", () => {
    /*
     * The soft-navigation fix: `useState` is an initializer and runs once, so a
     * prop that is still true after a soft navigation opens nothing.
     *
     * It now lives in ONE hook rather than being retyped per screen, which is
     * the point: four surfaces answer `?new=1` since "+ Add" can send the user
     * to any of them, and a re-implementation from memory loses either this fix
     * or the parameter-spending one below.
     */
    const hook = readFileSync(join(ROOT, "lib/use-create-signal.ts"), "utf8");
    expect(hook).toContain("lastCreateSignal");
    // And it spends the parameter, or pressing Add twice does nothing.
    expect(hook).toContain('params.delete("new")');

    for (const file of [
      "components/tasks/tasks-view.tsx",
      "components/goals/goals-view.tsx",
      "components/habits/habits-view.tsx",
    ]) {
      expect(readFileSync(join(ROOT, file), "utf8"), file).toContain("useCreateSignal");
    }
  });
});

describe("revealed inputs are focused by the commit, not by a frame", () => {
  /*
   * The subtask composer used `requestAnimationFrame` to focus the input it had
   * just revealed. That is a wall clock, and the state update that mounts the
   * input also unmounts the button that was clicked, so between the click and
   * the frame NOTHING is focused: keystrokes land on `document.body` and vanish,
   * and an Escape never reaches the composer's handler so it closes the panel.
   *
   * In jsdom `requestAnimationFrame` is a plain 60Hz interval, so a loaded test
   * suite stretched that window past the typing. It read as corrupted input
   * ("Second step" arriving as "ond step") rather than as a focus bug, and it
   * was the entire cause of tests/subtask-composer.test.tsx being flaky.
   *
   * Proven, not assumed: with the frame deliberately starved to 250ms the old
   * code failed 5 of 14 tests, including both the reported ones, and the fixed
   * code passed 14/14.
   */
  it("does not focus the subtask composer from an animation frame", () => {
    const code = codeLines(join(ROOT, "components/tasks/task-detail-panel.tsx"))
      .map((l) => l.line)
      .join(String.fromCharCode(10));
    expect(code).not.toContain("requestAnimationFrame");
    // The replacement: React applies this during the host mount.
    expect(code).toContain("autoFocus");
  });
});

describe("not found", () => {
  it("has a branded boundary with a way back", () => {
    const nf = readFileSync(join(ROOT, "app/not-found.tsx"), "utf8");
    expect(nf).toContain("Page not found");
    // The default page left the reader with no navigation at all.
    expect(nf).toContain("/today");
    expect(nf).toContain("/login");
  });

  it("reads the session so the way back suits who is asking", () => {
    expect(readFileSync(join(ROOT, "app/not-found.tsx"), "utf8")).toContain("getCurrentUser");
  });
});

describe("auth boundary is unchanged", () => {
  it("still redirects unknown and protected paths without a session", () => {
    const proxy = readFileSync(join(ROOT, "proxy.ts"), "utf8");
    // Deliberately untouched: the proxy cannot tell an unknown route from a
    // protected one, and guessing wrong would serve a protected page.
    expect(proxy).toContain('new URL("/login", request.url)');
    expect(proxy).toContain("getSessionCookie");
  });

  it("keeps the public paths public", () => {
    const proxy = readFileSync(join(ROOT, "proxy.ts"), "utf8");
    for (const p of ["/login", "/register", "/forgot-password", "/reset-password"]) {
      expect(proxy).toContain(p);
    }
  });
});

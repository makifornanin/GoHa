#!/usr/bin/env node
/**
 * The consistency sweep.
 *
 * Three separate rounds of this project shipped a fix to the one component that
 * had been reported while its siblings kept the old pattern: the date picker was
 * replaced in the task modal, then found again in the task detail panel, then
 * again in the goal form. Each time the code was correct and the sweep was the
 * thing that was missing.
 *
 * So the sweep is a command rather than a habit. It greps for patterns that are
 * supposed to have exactly one implementation and fails if a second one appears.
 *
 * Run with `pnpm check:consistency`. Add a rule here whenever you replace a
 * shared primitive, so the next person cannot half-migrate it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SEARCH_DIRS = ["app", "components", "lib"];
const EXTS = [".ts", ".tsx"];

/** Every source file under the searched directories. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      walk(full, out);
    } else if (EXTS.some((e) => entry.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

const RULES = [
  {
    name: "native date inputs",
    // A planning date belongs in the shared DateField. The native control
    // renders different browser chrome everywhere and ignores GoHa's tokens.
    pattern: /type="(date|datetime-local)"/,
    allow: [
      // The one place a native date input is still described, in prose.
      "components/ui/input.tsx",
      "components/ui/date-field.tsx",
    ],
    fix: "Use <DateField> from components/ui/date-field.tsx.",
  },
  {
    name: "native time inputs",
    // Daily Rhythm is a real clock setting, but it uses the shared TimeField;
    // nothing should reach for the browser's spinner directly.
    pattern: /type="time"/,
    allow: ["components/ui/input.tsx", "components/ui/time-field.tsx"],
    fix: "Use <TimeField> from components/ui/time-field.tsx.",
  },
  {
    name: "raw blue behind white text",
    // `--blue` measures 4.02:1 against white in light and 3.65:1 in dark, short
    // of AA for normal text. `--blue-fill` is the same hue at 5.65:1.
    pattern: /bg-blue(?![-/\w])[^"]*\btext-white\b/,
    allow: [
      // Icon-only circles: a graphic needs 3:1, and the accent already clears it.
      "components/shell/mobile-bottom-nav.tsx",
      "components/focus/focus-view.tsx",
      "components/goals/goals-view.tsx",
      "components/celebration.tsx",
    ],
    fix: "Use bg-blue-fill when white TEXT sits on the blue.",
  },
  {
    name: "the word Task in user-visible copy",
    /*
     * docs/TERMINOLOGY.md: the product word is "To-do". The app had drifted to
     * three words for two things (the sidebar said To-dos, the form said New
     * Task, the goal panel said Linked tasks), which is how a product stops
     * explaining itself.
     *
     * Matches "task"/"Task" only where it is being SHOWN: inside a quoted
     * label, aria-label, placeholder, or title. Identifiers are untouched, and
     * they should be: the table is `tasks`, the route is /tasks, and renaming
     * storage to match prose is a large, risky, zero-value migration.
     */
    pattern:
      /(aria-label|placeholder|title|label|description)=\{?"[^"]*\b[Tt]asks?\b|\blabel:\s*"[^"]*\b[Tt]asks?\b/,
    /*
     * The two exceptions are PROPER NOUNS, so they are excused per LINE.
     *
     * This rule originally allow-listed the six files those names appear in,
     * which is the wrong granularity, and it hid a real bug the first time it
     * ran: the Task Map page header read "Sketch how your to-dos and ideas
     * connect ... link nodes to your tasks", half-converted, and the sweep
     * skipped the entire file because the title beside it legitimately says
     * "Task Map". An allow-list that excuses a file excuses everything in it.
     *
     *  - Task Map: the canvas holds notes, decisions, blockers and phases, so
     *    "To-do Map" describes it less well, and it has shipped under this name.
     *  - Smart Task Reminders: matches the `smart_task_reminder` enum value,
     *    the automation guides and the n8n workflows. Renaming the UI while the
     *    wire value stays would put two names on one thing, across a boundary
     *    GoHa does not control.
     */
    except: /[Tt]ask [Mm]ap|Smart [Tt]ask [Rr]eminder/,
    fix: 'Say "to-do". See docs/TERMINOLOGY.md; Task Map and Smart Task Reminders are the two exceptions.',
  },
  {
    name: "the word Task in JSX text",
    /*
     * The other half of the rule above, and the half that let two buttons
     * through: "Delete task" and "Reopen task" sat in the to-do detail panel as
     * plain JSX CHILDREN, not inside a quoted attribute, so an attribute-shaped
     * pattern could never see them. Browser QA found them; this finds the next
     * ones.
     *
     * Matches a SHORT BARE LABEL on its own line: no tag, no assignment, no
     * expression punctuation, no colon and no trailing separator. That shape is
     * a JSX text node and essentially nothing else, which is what keeps it off
     * TypeScript: `task: Task;` and `id: task.id,` both carry a colon, and type
     * annotations end in `;` or `,`.
     *
     * KNOWN LIMIT: it only sees labels, not prose. A sentence wrapped across
     * several JSX lines, or one containing a colon, slips past. Widening it to
     * catch those matched every type annotation in the codebase, which is a
     * worse trade: a rule with 44 false positives is a rule people switch off.
     * Long copy is caught by review, not by this.
     */
    pattern: /^\s*[A-Za-z][^<>={}()[\]"'`:;,.]*\b[Tt]asks?\b[^<>={}()[\]"'`:;,.]*$/,
    except: /[Tt]ask [Mm]ap|Smart [Tt]ask [Rr]eminder/,
    fix: 'Say "to-do". See docs/TERMINOLOGY.md.',
  },
  {
    name: "hyphenated sub-goal",
    // One spelling. "Subgoal", like "subtask". No exceptions anywhere.
    pattern: /[Ss]ub-goal/,
    fix: 'Write "subgoal". See docs/TERMINOLOGY.md.',
  },
];

const files = SEARCH_DIRS.flatMap((d) => {
  try {
    return walk(join(ROOT, d));
  } catch {
    return [];
  }
});

let failed = 0;
for (const rule of RULES) {
  const hits = [];
  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    /*
     * `allow` excuses a whole FILE and is a blunt instrument: it is right only
     * where the file IS the thing being matched, such as the shared primitive
     * that implements the control everything else must use. Anything narrower
     * belongs in `except`, which excuses a single LINE, so a legitimate use on
     * one line cannot hide a violation on the next.
     */
    if ((rule.allow ?? []).some((a) => rel === a)) continue;
    const text = readFileSync(file, "utf8");
    let inBlockComment = false;
    text.split(/\r?\n/).forEach((line, i) => {
      /*
       * Skip prose. These patterns get quoted in explanations, and a line
       * inside a JSX comment block can start with any character, so a leading
       * `*` test alone is not enough: track whether we are inside one.
       */
      const trimmed = line.trim();
      if (trimmed.startsWith("*") || trimmed.startsWith("//")) return;
      if (inBlockComment) {
        if (trimmed.includes("*/")) inBlockComment = false;
        return;
      }
      if (/^\{?\/\*/.test(trimmed)) {
        if (!trimmed.includes("*/")) inBlockComment = true;
        return;
      }
      if (!rule.pattern.test(line)) return;
      // A line-level excuse, checked after the match so the rule still has to
      // fire before anything is forgiven.
      if (rule.except?.test(line)) return;
      hits.push(`${rel}:${i + 1}`);
    });
  }
  if (hits.length) {
    failed += hits.length;
    console.error(`\n[FAIL] ${rule.name}: ${hits.length} occurrence(s)`);
    hits.forEach((h) => console.error(`   ${h}`));
    console.error(`   -> ${rule.fix}`);
  } else {
    console.log(`[ok]   ${rule.name}`);
  }
}

if (failed) {
  console.error(`\nConsistency sweep found ${failed} occurrence(s). See above.`);
  process.exit(1);
}
console.log(`\nConsistency sweep clean across ${files.length} files.`);

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
    if (rule.allow.some((a) => rel === a)) continue;
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
      if (rule.pattern.test(line)) hits.push(`${rel}:${i + 1}`);
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

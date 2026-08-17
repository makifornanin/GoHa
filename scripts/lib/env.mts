import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The one env-file reader for command line tooling (audit R-19).
 *
 * Next.js loads `.env*` itself at runtime; the standalone CLIs do not, so
 * `db:migrate`, `db:generate`, `db:backup` and `db:diagnose` each grew their
 * own copy of this function. Four copies drift: they had subtly different
 * regexes and no shared statement of precedence, which is exactly the kind of
 * difference that shows up as "it works in the app but not in the script" at
 * the worst possible moment.
 *
 * Precedence, matching Next.js for the files that matter here:
 *
 *   1. the real process environment (CI, a shell prefix) always wins
 *   2. `.env.local`
 *   3. `.env.$NODE_ENV`, when NODE_ENV is set
 *   4. `.env`
 *
 * Lines are parsed raw with no shell interpretation, so a connection string
 * containing `&`, `#` or `?` survives intact. Nothing here ever prints a value:
 * this module handles secrets and must stay silent about their contents
 * (CLAUDE.md section 5).
 *
 * `scripts/lib/require-test-db.mts` deliberately keeps its own reader. It is
 * the guard that stands between a destructive command and the owner's real
 * database, and it is worth more as a thing with no dependencies than as one
 * more caller of this.
 */

/** Read one env file into `process.env` without overwriting what is set. */
export function loadEnvFile(file: string): void {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    // A comment line has no key/value shape, but `# FOO=bar` does; skip it.
    if (line.trimStart().startsWith("#")) continue;

    const key = match[1];
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** Load the env files a CLI should see, in Next.js precedence order. */
export function loadEnv(): void {
  loadEnvFile(".env.local");
  if (process.env.NODE_ENV) loadEnvFile(`.env.${process.env.NODE_ENV}`);
  loadEnvFile(".env");
}

/**
 * Read a variable that the caller cannot continue without.
 *
 * The message names the variable and where to put it, and never echoes what
 * was found, so a mistyped value cannot end up in a terminal transcript or a
 * pasted bug report.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Add it to .env.local (see .env.example).`);
  }
  return value;
}

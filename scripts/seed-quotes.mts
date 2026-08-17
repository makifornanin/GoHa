import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { neon } from "@neondatabase/serverless";

import { loadEnv, requireEnv } from "./lib/env.mts";

/**
 * Seed the daily quote pool from `content/daily-quotes.json`
 * (automation Guide 00, step A6).
 *
 * Idempotent: it upserts on (source, text), so running it again after adding
 * entries adds only what is new and corrects attributions in place. Nothing is
 * ever deleted here; retiring a quote is `active = false`, which is a decision
 * made in the database, not by a file going missing.
 *
 * WHAT THIS SCRIPT WILL NOT DO, and the reason it exists in this shape:
 *
 * It writes `verified = false` for everything, always, and there is no flag to
 * change that. Scripture especially is not something to approximate: a verse
 * with a word wrong is a wrong verse, and this table is the one place in GoHa
 * where text is presented as authoritative rather than as something the owner
 * typed. Confirming wording against a real source is a human act.
 *
 * The file is yours to supply. Nothing generated it, and nothing should: use a
 * public-domain translation you can check (WEB, KJV), or paste from an edition
 * you own. The repository ships the schema, the picker and this loader; the
 * words are your responsibility, deliberately.
 *
 * Run: pnpm db:seed-quotes
 */

loadEnv();

const FILE = resolve(process.cwd(), "content/daily-quotes.json");

type SeedQuote = {
  source: "quote" | "verse";
  text: string;
  attribution?: string | null;
  translation?: string | null;
  theme?: string | null;
};

if (!existsSync(FILE)) {
  console.log(`No seed file at content/daily-quotes.json.

The quote pool stays empty, which is a working state: the card on Today shows
its empty message and the automation endpoints return quote: null.

To fill it, create that file as a JSON array:

[
  {
    "source": "verse",
    "text": "Commit your works to Yahweh, and your plans will succeed.",
    "attribution": "Proverbs 16:3 (WEB)",
    "theme": "work"
  },
  { "source": "quote", "text": "...", "attribution": "...", "theme": "rest" }
]

Include at least 30 entries with "theme": "rest" if you use a Sabbath day;
that is the pool the rest message draws from.`);
  process.exit(0);
}

const raw = JSON.parse(readFileSync(FILE, "utf8")) as unknown;
if (!Array.isArray(raw)) {
  throw new Error("content/daily-quotes.json must be a JSON array.");
}

const rows: SeedQuote[] = [];
for (const [index, entry] of raw.entries()) {
  if (!entry || typeof entry !== "object") {
    throw new Error(`Entry ${index} is not an object.`);
  }
  const item = entry as Record<string, unknown>;
  if (item.source !== "quote" && item.source !== "verse") {
    throw new Error(`Entry ${index}: "source" must be "quote" or "verse".`);
  }
  if (typeof item.text !== "string" || item.text.trim().length === 0) {
    throw new Error(`Entry ${index}: "text" is required.`);
  }
  if (item.text.length > 500) {
    throw new Error(`Entry ${index}: "text" is longer than 500 characters.`);
  }
  rows.push({
    source: item.source,
    text: item.text.trim(),
    attribution: typeof item.attribution === "string" ? item.attribution.trim() : null,
    translation: typeof item.translation === "string" ? item.translation.trim() : null,
    theme: typeof item.theme === "string" ? item.theme.trim() : null,
  });
}

const sql = neon(requireEnv("DATABASE_URL"));

let inserted = 0;
let updated = 0;

for (const row of rows) {
  const result = await sql`
    insert into daily_quotes (source, text, attribution, translation, theme, verified)
    values (${row.source}::quote_source, ${row.text}, ${row.attribution}, ${row.translation},
            ${row.theme}, false)
    on conflict (source, text) do update
      set attribution = excluded.attribution,
          translation = excluded.translation,
          theme = excluded.theme
    returning (xmax = 0) as is_insert
  `;
  if (result[0]?.is_insert) inserted += 1;
  else updated += 1;
}

const [{ total }] = await sql`select count(*)::int as total from daily_quotes where active`;
const [{ rest }] = await sql`
  select count(*)::int as rest from daily_quotes where active and theme = 'rest'
`;

console.log(`Seeded ${rows.length} entries: ${inserted} new, ${updated} updated.`);
console.log(`Pool now holds ${total} active entries, ${rest} of them rest-themed.`);
console.log(
  "\nEvery entry is stored with verified = false. Check the wording against your\n" +
    "source, then mark them verified in the database when you are satisfied.",
);

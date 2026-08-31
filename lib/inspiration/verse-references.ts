/**
 * The verses GoHa is willing to show as a daily inspiration.
 *
 * A CURATED LIST, and that is the point. The previous provider offered a
 * random-verse endpoint, which is a genuinely bad fit for this feature: a
 * random draw from 31,086 verses lands on a genealogy, a census, or a fragment
 * that means nothing out of context far more often than it lands on something
 * worth reading over breakfast. A person opening GoHa in the morning is not
 * asking for a random verse, they are asking for encouragement.
 *
 * So GoHa chooses the reference and the provider supplies the text. Nothing
 * here is scripture: these are book, chapter and verse numbers, and the wording
 * is always fetched from the Berean Standard Bible rather than typed from
 * memory. That division is deliberate. BUILD_PLAN hard rule 6 forbids inventing
 * scripture wording, and the only way to be certain is never to write any.
 *
 * Book ids are the USFM codes the API uses, verified against its own
 * `/api/BSB/books.json`.
 */

export type VerseReference = {
  /** USFM book id, e.g. "PHP". */
  book: string;
  chapter: number;
  verse: number;
};

/**
 * Chosen for three properties, in this order:
 *
 *   1. It stands alone. Nothing that needs the surrounding paragraph to parse.
 *   2. It is short enough to survive a phone notification whole. The resolver
 *      rejects anything over 240 characters, and a rejection costs a retry, so
 *      long passages are simply not listed.
 *   3. It is about work, perseverance, rest, or trust, which is what a
 *      productivity app has any business quoting at someone.
 */
export const VERSE_REFERENCES: readonly VerseReference[] = [
  // Work, diligence and plans
  { book: "PRO", chapter: 16, verse: 3 },
  { book: "PRO", chapter: 21, verse: 5 },
  { book: "PRO", chapter: 13, verse: 4 },
  { book: "PRO", chapter: 12, verse: 24 },
  { book: "PRO", chapter: 14, verse: 23 },
  { book: "PRO", chapter: 3, verse: 5 },
  { book: "PRO", chapter: 3, verse: 6 },
  { book: "PRO", chapter: 4, verse: 25 },
  { book: "PRO", chapter: 19, verse: 21 },
  { book: "PRO", chapter: 27, verse: 17 },
  { book: "ECC", chapter: 9, verse: 10 },
  { book: "ECC", chapter: 3, verse: 1 },
  { book: "COL", chapter: 3, verse: 23 },
  { book: "1CO", chapter: 15, verse: 58 },
  { book: "1CO", chapter: 10, verse: 31 },
  { book: "2TH", chapter: 3, verse: 13 },
  { book: "GAL", chapter: 6, verse: 9 },

  // Perseverance
  { book: "PHP", chapter: 4, verse: 13 },
  { book: "PHP", chapter: 3, verse: 14 },
  { book: "PHP", chapter: 1, verse: 6 },
  { book: "ISA", chapter: 40, verse: 31 },
  { book: "ISA", chapter: 41, verse: 10 },
  { book: "ISA", chapter: 43, verse: 19 },
  { book: "JOS", chapter: 1, verse: 9 },
  { book: "HEB", chapter: 12, verse: 1 },
  { book: "JAS", chapter: 1, verse: 12 },
  { book: "ROM", chapter: 5, verse: 3 },
  { book: "ROM", chapter: 12, verse: 12 },
  { book: "2TI", chapter: 1, verse: 7 },
  { book: "2CO", chapter: 4, verse: 16 },

  // Beginnings and today
  { book: "PSA", chapter: 118, verse: 24 },
  { book: "LAM", chapter: 3, verse: 23 },
  { book: "PSA", chapter: 90, verse: 12 },
  { book: "PSA", chapter: 143, verse: 8 },
  { book: "PSA", chapter: 5, verse: 3 },
  { book: "MAT", chapter: 6, verse: 34 },

  // Rest
  { book: "MAT", chapter: 11, verse: 28 },
  { book: "PSA", chapter: 23, verse: 1 },
  { book: "PSA", chapter: 23, verse: 2 },
  { book: "PSA", chapter: 46, verse: 10 },
  { book: "EXO", chapter: 33, verse: 14 },
  { book: "PSA", chapter: 127, verse: 2 },
  { book: "MRK", chapter: 6, verse: 31 },

  // Guidance and trust
  { book: "PSA", chapter: 119, verse: 105 },
  { book: "PSA", chapter: 37, verse: 5 },
  { book: "PSA", chapter: 32, verse: 8 },
  { book: "JER", chapter: 29, verse: 11 },
  { book: "ISA", chapter: 30, verse: 21 },
  { book: "PRO", chapter: 16, verse: 9 },
  { book: "PSA", chapter: 121, verse: 2 },
  { book: "ROM", chapter: 8, verse: 28 },
  { book: "PSA", chapter: 16, verse: 8 },

  // Courage
  { book: "DEU", chapter: 31, verse: 6 },
  // 1 Chronicles 28:20 was here and is deliberately gone: the BSB renders it at
  // 260 characters, past the 240 the resolver accepts, so every draw of it cost
  // a rejected fetch and a retry. Verified against the live API, not guessed.
  { book: "PSA", chapter: 27, verse: 1 },
  { book: "2TI", chapter: 4, verse: 7 },
  { book: "EPH", chapter: 6, verse: 10 },
  { book: "1PE", chapter: 5, verse: 7 },

  // Character
  { book: "MIC", chapter: 6, verse: 8 },
  { book: "GAL", chapter: 5, verse: 22 },
  { book: "PHP", chapter: 4, verse: 8 },
  { book: "PHP", chapter: 2, verse: 4 },
  { book: "JAS", chapter: 1, verse: 19 },
  { book: "PRO", chapter: 15, verse: 1 },
  { book: "COL", chapter: 3, verse: 12 },
  { book: "1TH", chapter: 5, verse: 16 },
  { book: "1TH", chapter: 5, verse: 18 },
  { book: "PSA", chapter: 19, verse: 14 },
];

/**
 * Pick a reference, avoiding a chosen set where possible.
 *
 * `avoid` carries the book/chapter/verse keys already shown inside the
 * freshness window. When every listed reference is recent the whole list is
 * used again, because showing a repeat is a far better outcome than showing
 * nothing.
 */
export function pickReference(
  avoid: ReadonlySet<string> = new Set(),
  random: () => number = Math.random,
): VerseReference {
  const fresh = VERSE_REFERENCES.filter((ref) => !avoid.has(referenceKey(ref)));
  const pool = fresh.length > 0 ? fresh : VERSE_REFERENCES;
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)));
  return pool[index];
}

/** "PHP 4:13". Stable, and what the freshness set is keyed on. */
export function referenceKey(ref: VerseReference): string {
  return `${ref.book} ${ref.chapter}:${ref.verse}`;
}

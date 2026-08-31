import { z } from "zod";

import { pickReference, referenceKey, type VerseReference } from "./verse-references";

/**
 * The two external content providers, normalized into one shape.
 *
 * No `server-only` import here on purpose. Nothing in this file touches the
 * database or a secret, it takes its `fetch` as an argument, and keeping it
 * plain lets the normalization and the malformed-response handling be tested
 * directly rather than through a route. The rule that these are never called
 * from the browser is enforced where it actually matters: the only callers are
 * a Server Component and the worker job preparer, both server-side, and neither
 * ships to the client.
 */

export type InspirationType = "quote" | "bible_verse";

/** The normalized record, before it is given a date and stored. */
export type InspirationContent = {
  type: InspirationType;
  text: string;
  source: string;
  translation?: string;
  provider: string;
};

export const QUOTESLATE_URL = "https://quoteslate.vercel.app/api/quotes/random";
export const ZENQUOTES_URL = "https://zenquotes.io/api/random";

/**
 * The Free Use Bible API (AO Lab), serving the Berean Standard Bible.
 *
 * Chosen after checking what the licensing actually permits, which is the part
 * that rules out most of the alternatives. The BSB was placed in the PUBLIC
 * DOMAIN on 30 April 2023: no licence, no permission, no verse limit, no fee.
 * The API itself needs no key, states no rate limit, and imposes no copyright
 * restrictions of its own.
 *
 * That combination is rarer than it sounds. Every modern translation people
 * actually ask for by name (NIV, NLT, CSB, ESV) is under copyright, and reading
 * one out of an unofficial endpoint is republishing someone else's text without
 * permission. The BSB is the one that is BOTH modern and free, which is why the
 * readability improvement here costs nothing legally.
 *
 * The replaced provider served the World English Bible, whose 1901-derived
 * English ("Yahweh", "Don't be dismayed") was the readability problem this
 * change exists to fix. It is kept below as the fallback, because a public
 * domain verse in older English is still far better than no verse at all.
 */
export const BSB_API_BASE = "https://bible.helloao.org/api/BSB";
export const BSB_TRANSLATION = "BSB";

/**
 * The previous provider, kept as the second link in the chain.
 *
 * The BASE now, not the random endpoint: the fallback asks for the same curated
 * reference the BSB was asked for. See `fetchWebBibleVerse`.
 */
export const BIBLE_API_URL = "https://bible-api.com";

/**
 * Asked of QuoteSlate directly, rather than fetching anything and filtering
 * here. Letting the provider do it means a usable quote on the first attempt
 * instead of burning retries on 400-character ones.
 */
export const QUOTE_MAX_LENGTH = 160;
const QUOTESLATE_TAGS = "motivation,inspiration";

function quoteSlateUrl(): string {
  const params = new URLSearchParams({
    maxLength: String(QUOTE_MAX_LENGTH),
    tags: QUOTESLATE_TAGS,
  });
  return `${QUOTESLATE_URL}?${params.toString()}`;
}

/**
 * How long a provider gets before we stop waiting.
 *
 * This runs inside a Server Component render on a cache miss, so it is the
 * user's time-to-first-byte being spent. Six seconds is long enough for a cold
 * Render.com dyno to wake and short enough that a dead provider does not hold
 * the page; past it the curated fallback answers immediately.
 */
export const PROVIDER_TIMEOUT_MS = 6000;

/**
 * The longest text we will accept from a provider.
 *
 * The same string has to fit a phone notification, so a 900-character parable
 * is not usable. Over-long content is REJECTED and refetched rather than cut:
 * truncating scripture or an aphorism changes what it says, which is worse than
 * showing something else entirely.
 */
export const MAX_TEXT_LENGTH = 240;

/** Below this a "quote" is an artefact, not a thought. */
const MIN_TEXT_LENGTH = 8;

/** QuoteSlate: `{ id, quote, author, length, tags }`. Verified against the live API. */
const quoteSlateSchema = z.object({
  quote: z.string().min(1),
  author: z.string().optional(),
  length: z.number().optional(),
  tags: z.array(z.string()).optional(),
});

/** ZenQuotes: a one-element array of `{ q, a }`. Verified against the live API. */
const zenQuotesSchema = z
  .array(z.object({ q: z.string().min(1), a: z.string().optional() }))
  .min(1);

/**
 * bible-api.com random-verse shape. `verses` carries the reference parts;
 * `reference` is the pre-joined label when the endpoint supplies one.
 */
const bibleApiSchema = z.object({
  translation: z.object({ identifier: z.string().optional() }).optional(),
  random_verse: z
    .object({
      book: z.string().min(1),
      chapter: z.number().int().positive(),
      verse: z.number().int().positive(),
      text: z.string().min(1),
    })
    .optional(),
  verses: z
    .array(
      z.object({
        book_name: z.string().min(1),
        chapter: z.number().int().positive(),
        verse: z.number().int().positive(),
        text: z.string().min(1),
      }),
    )
    .optional(),
});

/** Providers return scripture with newlines and doubled spaces in it. */
function tidy(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Curly quotes wrapping the whole line add nothing once it is styled. */
function unwrapQuotes(value: string): string {
  const trimmed = tidy(value);
  const wrapped = /^["“”']([\s\S]*)["“”']$/.exec(trimmed);
  return wrapped ? wrapped[1].trim() : trimmed;
}

export class ProviderError extends Error {}

async function getJson(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<unknown> {
  // AbortSignal.timeout would be tidier but a stubbed fetch in tests never sees
  // it; an explicit controller behaves the same for real callers and stays
  // observable for fake ones.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      // Provider content is random per call; a cached response would hand every
      // user the same verse for as long as the cache lived.
      cache: "no-store",
    });
    if (!response.ok) throw new ProviderError(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * QuoteSlate, asked for short motivational content. `provider: "quoteslate"`.
 *
 * DORMANT: not in `QUOTE_PROVIDERS`, so nothing calls this at runtime. Kept
 * because it is correct, isolated and tested, ready for the day the endpoint
 * stops challenging non-browser clients. See `QUOTE_PROVIDERS` for why.
 */
export async function fetchQuoteSlate(
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = PROVIDER_TIMEOUT_MS,
): Promise<InspirationContent> {
  const parsed = quoteSlateSchema.safeParse(await getJson(quoteSlateUrl(), fetchImpl, timeoutMs));
  if (!parsed.success) throw new ProviderError("malformed quoteslate response");

  const text = unwrapQuotes(parsed.data.quote);
  if (text.length < MIN_TEXT_LENGTH) throw new ProviderError("quote too short");

  return {
    type: "quote",
    text,
    source: tidy(parsed.data.author ?? "") || "Unknown",
    provider: "quoteslate",
  };
}

/** ZenQuotes. No filter parameters, so length is enforced by the caller. */
export async function fetchZenQuotes(
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = PROVIDER_TIMEOUT_MS,
): Promise<InspirationContent> {
  const parsed = zenQuotesSchema.safeParse(await getJson(ZENQUOTES_URL, fetchImpl, timeoutMs));
  if (!parsed.success) throw new ProviderError("malformed zenquotes response");

  const row = parsed.data[0];
  const author = tidy(row.a ?? "");
  /*
   * ZenQuotes reports its own rate limit as a normal-looking quote attributed
   * to itself. Taken at face value that would be shown to the user as the
   * morning's inspiration, so it is treated as the failure it actually is.
   */
  if (author.toLowerCase() === "zenquotes.io") throw new ProviderError("zenquotes rate limited");

  const text = unwrapQuotes(row.q);
  if (text.length < MIN_TEXT_LENGTH) throw new ProviderError("quote too short");

  return { type: "quote", text, source: author || "Unknown", provider: "zenquotes" };
}

/**
 * The quote providers actually used at runtime.
 *
 * ZenQuotes only. `fetchQuoteSlate` above is DORMANT and deliberately absent
 * here: QuoteSlate's deployment sits behind Vercel's Attack Challenge Mode,
 * which answers any non-browser client with HTTP 429 and an HTML interstitial
 * that only a JavaScript-executing browser can clear. Verified with a single
 * clean server request after a cooldown, and separately confirmed that a real
 * browser gets 200 and valid JSON from the identical URL. GoHa calls this from
 * a Server Component and from the worker, so neither can ever clear it.
 *
 * Leaving it first in the chain cost a guaranteed failed request before every
 * single quote fetch, which is latency spent on a known-impossible outcome. The
 * adapter is kept because it is self-contained and still covered by tests, so
 * if the challenge is ever lifted this becomes a one-line change rather than a
 * rewrite.
 */
const QUOTE_PROVIDERS = [fetchZenQuotes] as const;

/**
 * A motivational quote from the first provider that answers usefully.
 *
 * Each provider gets one chance per call; the resolver's own retry loop decides
 * whether to ask again. A provider that is down fails fast, so the chain costs
 * little.
 */
export async function fetchQuote(
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = PROVIDER_TIMEOUT_MS,
): Promise<InspirationContent> {
  let lastError: unknown;
  for (const provider of QUOTE_PROVIDERS) {
    try {
      return await provider(fetchImpl, timeoutMs);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new ProviderError("no quote provider answered");
}

/**
 * The Free Use Bible API's chapter shape.
 *
 * A chapter is a list of blocks: headings, verses, line breaks. A verse's
 * `content` is an array because footnote markers and formatting runs arrive as
 * their own entries; only the strings are text, and the rest is dropped.
 */
const bsbChapterSchema = z.object({
  book: z.object({ commonName: z.string().min(1).optional(), name: z.string().min(1).optional() }),
  chapter: z.object({
    number: z.number().int().positive(),
    content: z.array(
      z.object({
        type: z.string(),
        number: z.number().int().positive().optional(),
        content: z.array(z.unknown()).optional(),
      }),
    ),
  }),
});

/**
 * Pull the words out of one verse's content array.
 *
 * TWO shapes, and missing the second one is a bug a stubbed test cannot catch.
 * PROSE arrives as plain strings. POETRY (the Psalms, Proverbs, Isaiah, and
 * every other verse the API marks up with line breaks) arrives as objects
 * carrying `{ text, poem }`. Reading only the strings silently returned an
 * empty verse for every poetic reference, which is most of the curated list;
 * a live fetch is what surfaced it.
 *
 * Everything without text is dropped: `{ noteId }` footnote markers and
 * `{ lineBreak: true }` are structure, not words. Nothing here is ever
 * stringified blindly, because `[object Object]` inside scripture is the kind
 * of quiet corruption a verse must never suffer.
 */
function verseText(parts: readonly unknown[]): string {
  const words: string[] = [];
  for (const part of parts) {
    if (typeof part === "string") {
      words.push(part);
      continue;
    }
    if (part && typeof part === "object" && "text" in part) {
      const value = (part as { text: unknown }).text;
      if (typeof value === "string") words.push(value);
    }
  }
  return words.join(" ");
}

/**
 * A verse from the Berean Standard Bible: modern, readable, public domain.
 *
 * GoHa names the reference and the provider supplies the wording. The endpoint
 * has no random-verse route, which turned out to be a feature rather than a
 * gap: drawing at random from every verse in scripture surfaces genealogies and
 * census figures far more often than encouragement, and this feature exists to
 * encourage someone at the start of their day. See `verse-references.ts`.
 *
 * `avoidKeys` are references already shown inside the freshness window, so a
 * retry after a rejection asks for a different verse instead of the same one.
 */
export async function fetchBibleVerse(
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = PROVIDER_TIMEOUT_MS,
  options: {
    avoidKeys?: ReadonlySet<string>;
    random?: () => number;
    /** An already-chosen reference, so a chain can ask both providers for it. */
    reference?: VerseReference;
  } = {},
): Promise<InspirationContent> {
  const reference =
    options.reference ??
    pickReference(options.avoidKeys ?? new Set(), options.random ?? Math.random);
  const url = `${BSB_API_BASE}/${reference.book}/${reference.chapter}.json`;

  const parsed = bsbChapterSchema.safeParse(await getJson(url, fetchImpl, timeoutMs));
  if (!parsed.success) throw new ProviderError("malformed bsb response");

  const block = parsed.data.chapter.content.find(
    (entry) => entry.type === "verse" && entry.number === reference.verse,
  );
  if (!block) throw new ProviderError(`bsb chapter is missing ${referenceKey(reference)}`);

  const text = tidy(verseText(block.content ?? []));
  if (text.length < MIN_TEXT_LENGTH) throw new ProviderError("verse too short");

  const bookName = parsed.data.book.commonName ?? parsed.data.book.name ?? reference.book;
  return {
    type: "bible_verse",
    text,
    source: `${tidy(bookName)} ${reference.chapter}:${reference.verse}`,
    translation: BSB_TRANSLATION,
    provider: "bsb",
  };
}

/**
 * The same curated reference, in the World English Bible. The fallback link.
 *
 * Worth keeping because it is a different host with a different failure mode:
 * when the BSB endpoint is down, this is the difference between a verse in
 * older English and no verse at all. WEB is public domain and needs no credit.
 *
 * It asks for a REFERENCE, not for a random verse, which is the correction the
 * live smoke test forced. Pointing the fallback at the random endpoint quietly
 * reintroduced the exact problem this whole change exists to fix: with the BSB
 * failing, mornings were being handed "the third part of a hin of wine" from
 * Numbers. A fallback that abandons the curation is not a fallback for THIS
 * feature. Conveniently, bible-api.com accepts the same USFM book ids.
 */
export async function fetchWebBibleVerse(
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = PROVIDER_TIMEOUT_MS,
  reference?: VerseReference,
): Promise<InspirationContent> {
  const ref = reference ?? pickReference();
  const url = `${BIBLE_API_URL}/${ref.book}+${ref.chapter}:${ref.verse}?translation=web`;
  const parsed = bibleApiSchema.safeParse(await getJson(url, fetchImpl, timeoutMs));
  if (!parsed.success) throw new ProviderError("malformed bible response");

  // The endpoint has shipped both shapes; take whichever is present rather than
  // failing on the one we did not happen to code against.
  const verse = parsed.data.random_verse
    ? {
        book: parsed.data.random_verse.book,
        chapter: parsed.data.random_verse.chapter,
        number: parsed.data.random_verse.verse,
        text: parsed.data.random_verse.text,
      }
    : parsed.data.verses?.[0]
      ? {
          book: parsed.data.verses[0].book_name,
          chapter: parsed.data.verses[0].chapter,
          number: parsed.data.verses[0].verse,
          text: parsed.data.verses[0].text,
        }
      : null;
  if (!verse) throw new ProviderError("malformed bible response");

  const text = tidy(verse.text);
  if (text.length < MIN_TEXT_LENGTH) throw new ProviderError("verse too short");

  return {
    type: "bible_verse",
    text,
    source: `${tidy(verse.book)} ${verse.chapter}:${verse.number}`,
    // WEB is what this endpoint serves; trust its own label when it gives one.
    translation: parsed.data.translation?.identifier?.toUpperCase() || "WEB",
    provider: "bible_api",
  };
}

/**
 * A verse from the first provider that answers usefully.
 *
 * Same shape as `fetchQuote`: each provider gets one chance per call, and the
 * resolver's retry loop decides whether to ask again. The BSB is first because
 * it is what this feature is FOR; the WEB endpoint answers when it cannot.
 */
export async function fetchVerse(
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = PROVIDER_TIMEOUT_MS,
  options: { avoidKeys?: ReadonlySet<string>; random?: () => number } = {},
): Promise<InspirationContent> {
  /*
   * The reference is chosen ONCE, here, and both providers are asked for it.
   *
   * Letting the fallback pick its own would mean a BSB outage silently changed
   * which verse the day got, and freshness would be steered for one provider
   * and not the other.
   */
  const reference = pickReference(options.avoidKeys ?? new Set(), options.random ?? Math.random);
  try {
    return await fetchBibleVerse(fetchImpl, timeoutMs, { reference });
  } catch (error) {
    try {
      return await fetchWebBibleVerse(fetchImpl, timeoutMs, reference);
    } catch {
      // The FIRST failure is the useful one to report: it names the provider
      // this feature actually depends on.
      throw error instanceof Error ? error : new ProviderError("no verse provider answered");
    }
  }
}

/** Whether content is short enough to survive a phone notification intact. */
export function isConcise(content: InspirationContent): boolean {
  return content.text.length <= MAX_TEXT_LENGTH;
}

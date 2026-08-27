import { z } from "zod";

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
export const BIBLE_API_URL = "https://bible-api.com/data/web/random";

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

/** A World English Bible verse, normalized. Throws `ProviderError` on anything unusable. */
export async function fetchBibleVerse(
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = PROVIDER_TIMEOUT_MS,
): Promise<InspirationContent> {
  const parsed = bibleApiSchema.safeParse(await getJson(BIBLE_API_URL, fetchImpl, timeoutMs));
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

/** Whether content is short enough to survive a phone notification intact. */
export function isConcise(content: InspirationContent): boolean {
  return content.text.length <= MAX_TEXT_LENGTH;
}

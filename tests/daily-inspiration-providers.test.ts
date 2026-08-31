import { describe, expect, it, vi } from "vitest";

import {
  BIBLE_API_URL,
  BSB_API_BASE,
  fetchBibleVerse,
  fetchQuote,
  fetchVerse,
  fetchWebBibleVerse,
  fetchQuoteSlate,
  fetchZenQuotes,
  isConcise,
  MAX_TEXT_LENGTH,
  ProviderError,
  QUOTE_MAX_LENGTH,
  QUOTESLATE_URL,
  ZENQUOTES_URL,
} from "@/lib/inspiration/providers";
import { referenceKey, VERSE_REFERENCES } from "@/lib/inspiration/verse-references";

/**
 * Normalizing the external providers.
 *
 * Everything a provider sends is treated as untrusted input: a 200 carrying the
 * wrong shape, a field that quietly went missing, a rate-limit notice dressed up
 * as content, or a response that is not JSON at all. Each must raise
 * `ProviderError` so the resolver can retry or fall back, and none may reach the
 * user as a crash.
 *
 * The bodies below are copied from the live APIs, not imagined.
 */

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

function stubFetch(body: unknown, ok = true, status = 200) {
  return vi.fn(async () => jsonResponse(body, ok, status)) as unknown as typeof fetch;
}

/** Walks a list of bodies; `null` means that call fails with a 429. */
function chainFetch(bodies: unknown[]) {
  let i = 0;
  return vi.fn(async () => {
    const body = bodies[i++];
    if (body === null) return jsonResponse({}, false, 429);
    return jsonResponse(body);
  }) as unknown as typeof fetch;
}

/** QuoteSlate, exactly as the live API returns it. */
const QUOTE_BODY = {
  id: 2342,
  quote: "  Small progress is still progress.  ",
  author: "  Ada Lovelace ",
  length: 33,
  tags: ["motivation", "inspiration"],
};

/** ZenQuotes, exactly as the live API returns it. */
const ZEN_BODY = [
  { q: "In the practice of tolerance, one enemy is the best teacher.", a: "Dalai Lama", h: "<blockquote>" },
];

const BIBLE_BODY = {
  translation: { identifier: "web", name: "World English Bible" },
  random_verse: {
    book: "Philippians",
    chapter: 4,
    verse: 13,
    text: "I can do all things\nthrough Christ,  who strengthens me.",
  },
};

describe("QuoteSlate normalization", () => {
  it("normalizes into the canonical shape", async () => {
    await expect(fetchQuoteSlate(stubFetch(QUOTE_BODY))).resolves.toEqual({
      type: "quote",
      text: "Small progress is still progress.",
      source: "Ada Lovelace",
      provider: "quoteslate",
    });
  });

  it("asks the provider for short motivational content, uncached", async () => {
    const fetchImpl = stubFetch(QUOTE_BODY);
    await fetchQuoteSlate(fetchImpl);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const parsed = new URL(url as string);

    expect(`${parsed.origin}${parsed.pathname}`).toBe(QUOTESLATE_URL);
    // Filtering at the provider beats fetching anything and rejecting it here:
    // it means a usable quote on the first attempt rather than a burnt retry.
    expect(parsed.searchParams.get("maxLength")).toBe(String(QUOTE_MAX_LENGTH));
    expect(parsed.searchParams.get("tags")).toBe("motivation,inspiration");
    // A cached response would hand every user the same quote for as long as the
    // cache lived, which defeats a random endpoint.
    expect((init as RequestInit).cache).toBe("no-store");
  });

  it("keeps an unattributed quote rather than inventing an author", async () => {
    await expect(
      fetchQuoteSlate(stubFetch({ quote: "Begin somewhere useful." })),
    ).resolves.toMatchObject({ source: "Unknown" });
  });

  it("strips wrapping quote marks so the card can add its own", async () => {
    const body = { quote: `"Well begun is half done."`, author: "Aristotle" };
    await expect(fetchQuoteSlate(stubFetch(body))).resolves.toMatchObject({
      text: "Well begun is half done.",
    });
  });

  it("rejects a malformed body", async () => {
    await expect(fetchQuoteSlate(stubFetch({ nope: true }))).rejects.toBeInstanceOf(ProviderError);
    await expect(fetchQuoteSlate(stubFetch({ author: "x" }))).rejects.toBeInstanceOf(ProviderError);
  });

  it("rejects a non-200", async () => {
    // The live deployment answers a server with 429 and an HTML challenge.
    await expect(fetchQuoteSlate(stubFetch(QUOTE_BODY, false, 429))).rejects.toBeInstanceOf(
      ProviderError,
    );
  });
});

describe("ZenQuotes normalization", () => {
  it("normalizes into the canonical shape", async () => {
    await expect(fetchZenQuotes(stubFetch(ZEN_BODY))).resolves.toEqual({
      type: "quote",
      text: "In the practice of tolerance, one enemy is the best teacher.",
      source: "Dalai Lama",
      provider: "zenquotes",
    });
  });

  it("calls the documented random endpoint", async () => {
    const fetchImpl = stubFetch(ZEN_BODY);
    await fetchZenQuotes(fetchImpl);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(ZENQUOTES_URL);
  });

  it("treats its rate-limit notice as a failure, not as a quote", async () => {
    // It arrives shaped exactly like a real quote, attributed to the service
    // itself. Taken at face value it would be shown as the morning inspiration.
    const limited = [{ q: "Too many requests. Obtain an auth key.", a: "zenquotes.io" }];
    await expect(fetchZenQuotes(stubFetch(limited))).rejects.toBeInstanceOf(ProviderError);
  });

  it("rejects a malformed body", async () => {
    await expect(fetchZenQuotes(stubFetch([]))).rejects.toBeInstanceOf(ProviderError);
    await expect(fetchZenQuotes(stubFetch({ q: "x" }))).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("active quote provider", () => {
  it("uses ZenQuotes", async () => {
    await expect(fetchQuote(stubFetch(ZEN_BODY))).resolves.toMatchObject({
      provider: "zenquotes",
    });
  });

  it("does NOT call QuoteSlate first", async () => {
    /*
     * The point of this cleanup. QuoteSlate answers a server with 429 and an
     * HTML challenge every single time, so having it first meant a guaranteed
     * failed request before every quote fetch: latency spent on a
     * known-impossible outcome. One call, to ZenQuotes.
     */
    const fetchImpl = stubFetch(ZEN_BODY);
    await fetchQuote(fetchImpl);
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(ZENQUOTES_URL);
    expect(String(calls[0][0])).not.toContain("quoteslate");
  });

  it("throws when it fails, so the resolver can retry and then fall back", async () => {
    await expect(fetchQuote(chainFetch([null]))).rejects.toBeInstanceOf(ProviderError);
  });

  it("propagates a transport failure", async () => {
    const dead = vi.fn(async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    await expect(fetchQuote(dead)).rejects.toThrow("ECONNRESET");
  });
});

describe("bible-api (WEB) normalization, the fallback provider", () => {
  it("normalizes into the canonical shape, collapsing whitespace", async () => {
    await expect(fetchWebBibleVerse(stubFetch(BIBLE_BODY))).resolves.toEqual({
      type: "bible_verse",
      text: "I can do all things through Christ, who strengthens me.",
      source: "Philippians 4:13",
      translation: "WEB",
      provider: "bible_api",
    });
  });

  it("asks for a curated reference, never the random endpoint", async () => {
    /*
     * The correction a live smoke test forced. Pointing the fallback at
     * bible-api's random-verse route quietly reintroduced the exact problem the
     * BSB change exists to fix: with the BSB failing, mornings were served "the
     * third part of a hin of wine" from Numbers 15. A fallback that abandons
     * the curation is not a fallback for THIS feature.
     */
    const fetchImpl = stubFetch(BIBLE_BODY);
    await fetchWebBibleVerse(fetchImpl, undefined, { book: "PHP", chapter: 4, verse: 13 });
    const url = String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(url).toBe(`${BIBLE_API_URL}/PHP+4:13?translation=web`);
    expect(url).not.toContain("random");
  });

  it("accepts the alternative `verses` array shape", async () => {
    // This endpoint has shipped both shapes; failing on the one we did not code
    // against would take scripture offline for no good reason.
    const body = {
      translation: { identifier: "web" },
      verses: [{ book_name: "Psalms", chapter: 118, verse: 24, text: "This is the day." }],
    };
    await expect(fetchWebBibleVerse(stubFetch(body))).resolves.toMatchObject({
      source: "Psalms 118:24",
      translation: "WEB",
    });
  });

  it("rejects a malformed body", async () => {
    await expect(fetchWebBibleVerse(stubFetch({ translation: {} }))).rejects.toBeInstanceOf(
      ProviderError,
    );
    await expect(
      fetchWebBibleVerse(stubFetch({ random_verse: { book: "X", chapter: 1 } })),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("rejects a non-200", async () => {
    await expect(fetchWebBibleVerse(stubFetch(BIBLE_BODY, false, 500))).rejects.toBeInstanceOf(
      ProviderError,
    );
  });
});

describe("length guard", () => {
  it("accepts content that fits a notification", () => {
    expect(
      isConcise({ type: "quote", text: "a".repeat(MAX_TEXT_LENGTH), provider: "x", source: "y" }),
    ).toBe(true);
  });

  it("rejects content that does not", () => {
    // Rejected, never truncated: cutting scripture or an aphorism changes what
    // it says, which is worse than showing something else.
    expect(
      isConcise({ type: "quote", text: "a".repeat(MAX_TEXT_LENGTH + 1), provider: "x", source: "y" }),
    ).toBe(false);
  });
});

describe("curated fallback pool", () => {
  it("is large enough not to repeat inside the freshness window", async () => {
    const { FALLBACK_POOL } = await import("@/lib/inspiration/fallback");
    expect(FALLBACK_POOL.quote.length).toBeGreaterThanOrEqual(15);
    expect(FALLBACK_POOL.bible_verse.length).toBeGreaterThanOrEqual(14);
  });

  it("keeps every entry short enough for a notification", async () => {
    const { FALLBACK_POOL } = await import("@/lib/inspiration/fallback");
    for (const item of [...FALLBACK_POOL.quote, ...FALLBACK_POOL.bible_verse]) {
      expect(isConcise(item), `${item.source} is too long`).toBe(true);
    }
  });

  it("labels every verse WEB and gives every entry an attribution", async () => {
    const { FALLBACK_POOL } = await import("@/lib/inspiration/fallback");
    for (const verse of FALLBACK_POOL.bible_verse) {
      // Never claim a translation the wording did not come from.
      expect(verse.translation).toBe("WEB");
      expect(verse.source).toMatch(/^[\w\s]+ \d+:\d+$/);
    }
    for (const item of [...FALLBACK_POOL.quote, ...FALLBACK_POOL.bible_verse]) {
      expect(item.source.length).toBeGreaterThan(0);
      expect(item.provider).toBe("goha_fallback");
    }
  });

  it("holds no duplicate text", async () => {
    const { FALLBACK_POOL } = await import("@/lib/inspiration/fallback");
    const all = [...FALLBACK_POOL.quote, ...FALLBACK_POOL.bible_verse].map((i) => i.text);
    expect(new Set(all).size).toBe(all.length);
  });
});

/**
 * A stub that answers whatever chapter the adapter asks for.
 *
 * GoHa chooses the reference now, so a fixed body would only work for whichever
 * verse the picker happened to land on. This reads the requested URL and builds
 * a chapter that contains it, which is what the live API does.
 */
function bsbFetch(overrides: { verseContent?: unknown[] } = {}) {
  return vi.fn(async (url: string | URL) => {
    const match = /\/api\/BSB\/([A-Z0-9]+)\/(\d+)\.json$/.exec(String(url));
    if (!match) return jsonResponse({}, false, 404);
    const [, book, chapter] = match;
    return jsonResponse({
      translation: { id: "BSB", name: "Berean Standard Bible" },
      book: { id: book, commonName: "Philippians", name: "Philippians" },
      chapter: {
        number: Number(chapter),
        content: [
          { type: "heading", content: ["A heading, which is not a verse"] },
          // Long enough for Psalm 119, the deepest reference in the curated list.
          ...Array.from({ length: 180 }, (_, i) => ({
            type: "verse",
            number: i + 1,
            content: overrides.verseContent ?? [`The wording of verse ${i + 1}.`],
          })),
        ],
      },
    });
  }) as unknown as typeof fetch;
}

describe("Berean Standard Bible, the active verse provider", () => {
  it("returns a verse labelled BSB, with its reference", async () => {
    const verse = await fetchBibleVerse(bsbFetch());
    expect(verse).toMatchObject({
      type: "bible_verse",
      translation: "BSB",
      provider: "bsb",
    });
    // "Philippians 4:13" shape: a book name, then chapter:verse.
    expect(verse.source).toMatch(/^.+ \d+:\d+$/);
  });

  it("asks for the chapter that holds the chosen reference", async () => {
    const fetchImpl = bsbFetch();
    await fetchBibleVerse(fetchImpl);
    const url = String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(url.startsWith(BSB_API_BASE)).toBe(true);
    expect(url.endsWith(".json")).toBe(true);
  });

  it("only ever asks for a curated reference", async () => {
    /*
     * The whole reason GoHa picks the reference instead of using a random-verse
     * endpoint: a random draw over 31,086 verses lands on a genealogy or a
     * census far more often than on something worth reading at breakfast.
     */
    for (let i = 0; i < 25; i++) {
      const fetchImpl = bsbFetch();
      await fetchBibleVerse(fetchImpl);
      const url = String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      const match = /\/api\/BSB\/([A-Z0-9]+)\/(\d+)\.json$/.exec(url)!;
      expect(
        VERSE_REFERENCES.some(
          (ref) => ref.book === match[1] && ref.chapter === Number(match[2]),
        ),
      ).toBe(true);
    }
  });

  it("avoids a reference the reader has just seen", async () => {
    const avoidKeys = new Set(VERSE_REFERENCES.slice(1).map(referenceKey));
    const fetchImpl = bsbFetch();
    // Everything but the first is recent, so the first is the only fresh one.
    await fetchBibleVerse(fetchImpl, undefined, { avoidKeys });
    const url = String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    const first = VERSE_REFERENCES[0];
    expect(url).toContain(`/${first.book}/${first.chapter}.json`);
  });

  it("reads POETRY verses, which arrive as objects rather than strings", async () => {
    /*
     * The bug a live fetch caught and a stub never could.
     *
     * Prose verses arrive as plain strings; the Psalms, Proverbs, Isaiah and
     * Lamentations arrive as `{ text, poem }` objects with `{ lineBreak }`
     * between the lines. Reading only the strings returned an EMPTY verse for
     * every poetic reference, which is more than half the curated list, and the
     * chain silently fell through to a random verse from the other provider.
     * The unit tests all passed, because their fixtures were prose.
     */
    const psalm = vi.fn(async () =>
      jsonResponse({
        book: { commonName: "Psalms" },
        chapter: {
          number: 23,
          content: [
            { type: "heading", content: ["The LORD Is My Shepherd"] },
            { type: "hebrew_subtitle", content: ["A Psalm of David."] },
            {
              type: "verse",
              number: 1,
              content: [
                { text: "The LORD is my shepherd;", poem: 1 },
                { noteId: 50 },
                { lineBreak: true },
                { text: "I shall not want.", poem: 2 },
              ],
            },
          ],
        },
      }),
    ) as unknown as typeof fetch;

    const verse = await fetchBibleVerse(psalm, undefined, {
      reference: { book: "PSA", chapter: 23, verse: 1 },
    });
    expect(verse.text).toBe("The LORD is my shepherd; I shall not want.");
    expect(verse.source).toBe("Psalms 23:1");
  });

  it("takes only the strings out of a verse's content", async () => {
    /*
     * Footnote markers and formatting runs arrive as objects in the same array.
     * Stringifying one would put "[object Object]" into scripture, which is the
     * kind of quiet corruption a verse must never suffer.
     */
    const verse = await fetchBibleVerse(
      bsbFetch({ verseContent: ["I can do all things", { noteId: 7 }, "through Christ."] }),
    );
    expect(verse.text).not.toContain("object");
    expect(verse.text).toBe("I can do all things through Christ.");
  });

  it("never invents wording when the chapter lacks the verse", async () => {
    const empty = vi.fn(async () =>
      jsonResponse({
        book: { commonName: "Philippians" },
        chapter: { number: 4, content: [] },
      }),
    ) as unknown as typeof fetch;
    await expect(fetchBibleVerse(empty)).rejects.toBeInstanceOf(ProviderError);
  });

  it("rejects a malformed body and a non-200", async () => {
    await expect(fetchBibleVerse(stubFetch({ chapter: {} }))).rejects.toBeInstanceOf(
      ProviderError,
    );
    await expect(fetchBibleVerse(stubFetch({}, false, 500))).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("verse provider chain", () => {
  it("prefers the BSB", async () => {
    await expect(fetchVerse(bsbFetch())).resolves.toMatchObject({ provider: "bsb" });
  });

  it("falls back to the WEB endpoint when the BSB is unreachable", async () => {
    // A different host with a different failure mode: this is the difference
    // between older English and no verse at all.
    const fetchImpl = vi.fn(async (url: string | URL) =>
      String(url).includes("helloao")
        ? jsonResponse({}, false, 503)
        : jsonResponse(BIBLE_BODY),
    ) as unknown as typeof fetch;
    await expect(fetchVerse(fetchImpl)).resolves.toMatchObject({ provider: "bible_api" });
  });

  it("reports a failure when both are down", async () => {
    const dead = vi.fn(async () => jsonResponse({}, false, 503)) as unknown as typeof fetch;
    await expect(fetchVerse(dead)).rejects.toBeInstanceOf(ProviderError);
  });
});

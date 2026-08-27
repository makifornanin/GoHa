import { describe, expect, it, vi } from "vitest";

import {
  BIBLE_API_URL,
  fetchBibleVerse,
  fetchQuote,
  fetchQuoteSlate,
  fetchZenQuotes,
  isConcise,
  MAX_TEXT_LENGTH,
  ProviderError,
  QUOTE_MAX_LENGTH,
  QUOTESLATE_URL,
  ZENQUOTES_URL,
} from "@/lib/inspiration/providers";

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

describe("bible-api normalization", () => {
  it("normalizes into the canonical shape, collapsing whitespace", async () => {
    await expect(fetchBibleVerse(stubFetch(BIBLE_BODY))).resolves.toEqual({
      type: "bible_verse",
      text: "I can do all things through Christ, who strengthens me.",
      source: "Philippians 4:13",
      translation: "WEB",
      provider: "bible_api",
    });
  });

  it("calls the documented WEB random endpoint", async () => {
    const fetchImpl = stubFetch(BIBLE_BODY);
    await fetchBibleVerse(fetchImpl);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(BIBLE_API_URL);
  });

  it("accepts the alternative `verses` array shape", async () => {
    // This endpoint has shipped both shapes; failing on the one we did not code
    // against would take scripture offline for no good reason.
    const body = {
      translation: { identifier: "web" },
      verses: [{ book_name: "Psalms", chapter: 118, verse: 24, text: "This is the day." }],
    };
    await expect(fetchBibleVerse(stubFetch(body))).resolves.toMatchObject({
      source: "Psalms 118:24",
      translation: "WEB",
    });
  });

  it("rejects a malformed body", async () => {
    await expect(fetchBibleVerse(stubFetch({ translation: {} }))).rejects.toBeInstanceOf(
      ProviderError,
    );
    await expect(
      fetchBibleVerse(stubFetch({ random_verse: { book: "X", chapter: 1 } })),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("rejects a non-200", async () => {
    await expect(fetchBibleVerse(stubFetch(BIBLE_BODY, false, 500))).rejects.toBeInstanceOf(
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

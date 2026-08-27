import { describe, expect, it, vi } from "vitest";

import type { IsoDate } from "@/lib/date";
import {
  MAX_PROVIDER_ATTEMPTS,
  RECENT_WINDOW_DAYS,
  resolveDailyInspiration,
  toInspirationPayload,
  type DailyInspiration,
  type InspirationStore,
} from "@/lib/inspiration/resolve";
import { MAX_TEXT_LENGTH } from "@/lib/inspiration/providers";

/**
 * The rules that make a Daily Inspiration canonical.
 *
 * Run against an in-memory store rather than Postgres, so the behaviour under
 * test is the resolver's own: one record per user per local date, a bounded
 * number of provider attempts, freshness preferred but never fatal, and a
 * fallback that keeps the day working when the network does not.
 *
 * `insertIfAbsent` here mimics the real unique constraint on
 * (user_id, local_date): first writer wins, later writers read the winner. If
 * the repository ever stopped resolving conflicts in the database, these tests
 * would still pass, which is why the repository states that requirement in its
 * own contract and the concurrency test below drives it through this same door.
 */

function makeStore(seed: DailyInspiration[] = []) {
  const rows = [...seed];
  let nextId = seed.length + 1;
  const store: InspirationStore & { rows: DailyInspiration[]; inserts: number } = {
    rows,
    inserts: 0,
    async find(userId, localDate) {
      return rows.find((r) => r.userId === userId && r.localDate === localDate) ?? null;
    },
    async recentTexts(userId, since) {
      return rows.filter((r) => r.userId === userId && r.localDate >= since).map((r) => r.text);
    },
    async insertIfAbsent(row) {
      store.inserts++;
      const existing = rows.find(
        (r) => r.userId === row.userId && r.localDate === row.localDate,
      );
      if (existing) return existing;
      const created: DailyInspiration = { id: `row-${nextId++}`, ...row };
      rows.push(created);
      return created;
    },
  };
  return store;
}

/**
 * A fetch stub returning a fresh ZenQuotes body each call.
 *
 * ZenQuotes is the sole active quote provider, so one attempt is exactly one
 * call. Its wire shape is a one-element array of `{ q, a }`.
 */
function quoteFetcher(texts: string[]) {
  let i = 0;
  return vi.fn(async () => {
    const q = texts[Math.min(i++, texts.length - 1)];
    return {
      ok: true,
      status: 200,
      json: async () => [{ q, a: "Author" }],
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

const alwaysQuote = () => 0.1; // < 0.5 selects "quote"
const alwaysVerse = () => 0.9; // >= 0.5 selects "bible_verse"

describe("one record per user per local date", () => {
  it("stores a record on the first read of a new day", async () => {
    const store = makeStore();
    const got = await resolveDailyInspiration("user-a", "2026-08-27", {
      store,
      fetchImpl: quoteFetcher(["Begin somewhere useful."]),
      random: alwaysQuote,
    });
    expect(got.text).toBe("Begin somewhere useful.");
    expect(got.localDate).toBe("2026-08-27");
    expect(store.rows).toHaveLength(1);
  });

  it("returns the exact same record on every later read that day", async () => {
    const store = makeStore();
    const deps = {
      store,
      // Would hand back different text every call if it were ever consulted again.
      fetchImpl: quoteFetcher(["first text", "second text", "third text"]),
      random: alwaysQuote,
    };
    const a = await resolveDailyInspiration("user-a", "2026-08-27", deps);
    const b = await resolveDailyInspiration("user-a", "2026-08-27", deps);
    const c = await resolveDailyInspiration("user-a", "2026-08-27", deps);

    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(store.rows).toHaveLength(1);
  });

  it("does not call a provider once the day is decided", async () => {
    const store = makeStore();
    const fetchImpl = quoteFetcher(["only once"]);
    const deps = { store, fetchImpl, random: alwaysQuote };
    await resolveDailyInspiration("user-a", "2026-08-27", deps);
    await resolveDailyInspiration("user-a", "2026-08-27", deps);
    await resolveDailyInspiration("user-a", "2026-08-27", deps);
    // Refreshing Today twenty times must not be twenty outbound requests.
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("can select a new record on the next local day", async () => {
    const store = makeStore();
    const deps = { store, fetchImpl: quoteFetcher(["day one text", "day two text"]), random: alwaysQuote };
    const first = await resolveDailyInspiration("user-a", "2026-08-27", deps);
    const second = await resolveDailyInspiration("user-a", "2026-08-28", deps);

    expect(second.id).not.toBe(first.id);
    expect(second.text).toBe("day two text");
    expect(store.rows).toHaveLength(2);
  });

  it("keeps users independent on the same date", async () => {
    const store = makeStore();
    const deps = { store, fetchImpl: quoteFetcher(["text for a", "text for b"]), random: alwaysQuote };
    const a = await resolveDailyInspiration("user-a", "2026-08-27", deps);
    const b = await resolveDailyInspiration("user-b", "2026-08-27", deps);

    expect(a.userId).toBe("user-a");
    expect(b.userId).toBe("user-b");
    expect(b.id).not.toBe(a.id);
    // One person's morning must never be decided by another person's.
    expect(b.text).not.toBe(a.text);
  });
});

describe("local date, not UTC date", () => {
  it("files 23:30 Asia/Manila under the local day, not the UTC one", async () => {
    /*
     * 2026-08-27T23:30+08:00 is 2026-08-27T15:30Z: same calendar day either way.
     * The interesting case is the one after it, below. The resolver never sees
     * an instant at all, only the local date the caller resolved, which is what
     * makes both cases correct by construction.
     */
    const store = makeStore();
    const deps = { store, fetchImpl: quoteFetcher(["late evening"]), random: alwaysQuote };
    const got = await resolveDailyInspiration("user-a", "2026-08-27", deps);
    expect(got.localDate).toBe("2026-08-27");
  });

  it("treats 00:30 Manila as a new local day though UTC is still yesterday", async () => {
    // 2026-08-28T00:30+08:00 is 2026-08-27T16:30Z. Truncating the instant would
    // file this under the 27th and re-serve yesterday's inspiration.
    const store = makeStore();
    const deps = { store, fetchImpl: quoteFetcher(["27th text", "28th text"]), random: alwaysQuote };
    const evening = await resolveDailyInspiration("user-a", "2026-08-27", deps);
    const justAfterMidnight = await resolveDailyInspiration("user-a", "2026-08-28", deps);

    expect(justAfterMidnight.localDate).toBe("2026-08-28");
    expect(justAfterMidnight.id).not.toBe(evening.id);
  });
});

describe("freshness", () => {
  it("retries past text the user saw inside the window", async () => {
    const store = makeStore([
      {
        id: "old",
        userId: "user-a",
        localDate: "2026-08-20",
        type: "quote",
        text: "seen recently",
        source: "Author",
        translation: null,
        provider: "quote_garden",
      },
    ]);
    const fetchImpl = quoteFetcher(["seen recently", "genuinely new"]);
    const got = await resolveDailyInspiration("user-a", "2026-08-27", {
      store,
      fetchImpl,
      random: alwaysQuote,
    });

    expect(got.text).toBe("genuinely new");
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it("allows the same text again once it falls outside the window", async () => {
    const stale: IsoDate = "2026-06-01"; // far more than 30 days before the 27th
    const store = makeStore([
      {
        id: "old",
        userId: "user-a",
        localDate: stale,
        type: "quote",
        text: "long ago",
        source: "Author",
        translation: null,
        provider: "quote_garden",
      },
    ]);
    const got = await resolveDailyInspiration("user-a", "2026-08-27", {
      store,
      fetchImpl: quoteFetcher(["long ago"]),
      random: alwaysQuote,
    });
    // Repeating after the window is intended: the pool is finite and this keeps
    // it usable rather than exhausting it.
    expect(got.text).toBe("long ago");
    expect(RECENT_WINDOW_DAYS).toBe(30);
  });

  it("still produces a record when history cannot be read", async () => {
    const store = makeStore();
    store.recentTexts = async () => {
      throw new Error("history unavailable");
    };
    // Freshness is a preference, not a precondition.
    const got = await resolveDailyInspiration("user-a", "2026-08-27", {
      store,
      fetchImpl: quoteFetcher(["still works"]),
      random: alwaysQuote,
    });
    expect(got.text).toBe("still works");
  });
});

describe("bounded retries and fallback", () => {
  it("stops asking after the attempt ceiling and uses the curated pool", async () => {
    const store = makeStore();
    const fetchImpl = vi.fn(async () => {
      throw new Error("provider down");
    }) as unknown as typeof fetch;
    const issues: string[] = [];

    const got = await resolveDailyInspiration("user-a", "2026-08-27", {
      store,
      fetchImpl,
      random: alwaysQuote,
      onProviderIssue: (m) => issues.push(m),
    });

    expect(issues).toHaveLength(MAX_PROVIDER_ATTEMPTS);
    expect(MAX_PROVIDER_ATTEMPTS).toBe(3);
    // One active provider, so an attempt is one request: no wasted call to a
    // provider that cannot answer a server.
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(
      MAX_PROVIDER_ATTEMPTS,
    );
    expect(got.provider).toBe("goha_fallback");
    expect(got.type).toBe("quote");
    // The day is still decided and still stored.
    expect(store.rows).toHaveLength(1);
  });

  it("falls back to a curated verse when the bible provider fails", async () => {
    const store = makeStore();
    const got = await resolveDailyInspiration("user-a", "2026-08-27", {
      store,
      fetchImpl: vi.fn(async () => {
        throw new Error("bible down");
      }) as unknown as typeof fetch,
      random: alwaysVerse,
    });
    expect(got.type).toBe("bible_verse");
    expect(got.provider).toBe("goha_fallback");
    expect(got.translation).toBe("WEB");
  });

  it("falls back on a malformed response rather than throwing", async () => {
    const store = makeStore();
    const garbage = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: "shape" }),
    })) as unknown as typeof fetch;

    const got = await resolveDailyInspiration("user-a", "2026-08-27", {
      store,
      fetchImpl: garbage,
      random: alwaysQuote,
    });
    expect(got.provider).toBe("goha_fallback");
  });

  it("rejects over-long content and retries instead of truncating", async () => {
    const store = makeStore();
    const long = "x".repeat(MAX_TEXT_LENGTH + 50);
    const fetchImpl = quoteFetcher([long, "short enough"]);

    const got = await resolveDailyInspiration("user-a", "2026-08-27", {
      store,
      fetchImpl,
      random: alwaysQuote,
    });

    expect(got.text).toBe("short enough");
    expect(got.text).not.toContain("xxx");
  });

  it("never loops forever when every attempt is a repeat", async () => {
    const store = makeStore([
      {
        id: "old",
        userId: "user-a",
        localDate: "2026-08-26",
        type: "quote",
        text: "same thing",
        source: "Author",
        translation: null,
        provider: "quote_garden",
      },
    ]);
    const fetchImpl = quoteFetcher(["same thing"]);
    const got = await resolveDailyInspiration("user-a", "2026-08-27", {
      store,
      fetchImpl,
      random: alwaysQuote,
    });

    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(
      MAX_PROVIDER_ATTEMPTS,
    );
    expect(got.provider).toBe("goha_fallback");
  });
});

describe("concurrency", () => {
  it("cannot create two canonical records for one user and date", async () => {
    const store = makeStore();
    // Both callers miss the read, both fetch, and they get DIFFERENT content:
    // the worker preparing a morning job and the owner opening Today.
    const deps = (text: string) => ({
      store,
      fetchImpl: quoteFetcher([text]),
      random: alwaysQuote,
    });

    const [first, second] = await Promise.all([
      resolveDailyInspiration("user-a", "2026-08-27", deps("worker won")),
      resolveDailyInspiration("user-a", "2026-08-27", deps("page won")),
    ]);

    // One row, and both callers hold it. The loser adopts the winner rather
    // than overwriting, so the card and the push agree.
    expect(store.rows).toHaveLength(1);
    expect(first).toEqual(second);
    expect(store.inserts).toBe(2);
  });

  it("keeps concurrent days and users separate", async () => {
    const store = makeStore();
    const deps = { store, fetchImpl: quoteFetcher(["alpha text", "beta text", "gamma text"]), random: alwaysQuote };
    await Promise.all([
      resolveDailyInspiration("user-a", "2026-08-27", deps),
      resolveDailyInspiration("user-a", "2026-08-28", deps),
      resolveDailyInspiration("user-b", "2026-08-27", deps),
    ]);
    expect(store.rows).toHaveLength(3);
  });
});

describe("type selection", () => {
  it("splits roughly evenly across days", async () => {
    // Deterministic sweep rather than real randomness: values below 0.5 must
    // choose a quote and values at or above it a verse, which is what makes the
    // real Math.random split even.
    const counts = { quote: 0, bible_verse: 0 };
    for (let i = 0; i < 100; i++) {
      const store = makeStore();
      const got = await resolveDailyInspiration("user-a", "2026-08-27", {
        store,
        fetchImpl: quoteFetcher(["some text here"]),
        random: () => i / 100,
      });
      counts[got.type]++;
    }
    expect(counts.quote).toBe(50);
    expect(counts.bible_verse).toBe(50);
  });
});

describe("payload shape", () => {
  const base: DailyInspiration = {
    id: "1",
    userId: "u",
    localDate: "2026-08-27",
    type: "quote",
    text: "Text",
    source: "Author",
    translation: null,
    provider: "quote_garden",
  };

  it("omits translation entirely when there is none", () => {
    const payload = toInspirationPayload(base);
    expect(payload).toEqual({
      type: "quote",
      text: "Text",
      source: "Author",
      provider: "quote_garden",
    });
    expect("translation" in payload).toBe(false);
  });

  it("includes translation for scripture", () => {
    expect(
      toInspirationPayload({ ...base, type: "bible_verse", translation: "WEB" }),
    ).toMatchObject({ type: "bible_verse", translation: "WEB" });
  });

  it("does not leak internal ids or dates to n8n", () => {
    const payload = toInspirationPayload(base);
    expect("id" in payload).toBe(false);
    expect("userId" in payload).toBe(false);
    expect("localDate" in payload).toBe(false);
  });
});

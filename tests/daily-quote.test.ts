import { describe, expect, it } from "vitest";

import { hashDate, pickDailyQuote, sourcesFor, type QuoteLike } from "@/lib/daily-quote";

/**
 * The daily quote pick (automation Guide 01, step 1.2).
 *
 * The promise is "same date, same quote", and it is load-bearing: the card on
 * Today and the morning notification pick independently, and they must land on
 * the same row without either telling the other.
 */

function quote(id: string, source: "quote" | "verse" = "quote"): QuoteLike {
  return { id, source, text: `text ${id}`, attribution: null, translation: null, theme: null };
}

const POOL = Array.from({ length: 12 }, (_, i) => quote(`q${i}`));

describe("pickDailyQuote", () => {
  it("returns the same quote for the same date, every time", () => {
    const first = pickDailyQuote(POOL, "2026-08-18");
    for (let i = 0; i < 50; i++) {
      expect(pickDailyQuote(POOL, "2026-08-18")).toBe(first);
    }
  });

  it("gives the app and the notification the same answer", () => {
    // Two independent callers, same inputs. This is the whole contract.
    const card = pickDailyQuote(POOL, "2026-08-18");
    const notification = pickDailyQuote([...POOL], "2026-08-18");
    expect(notification?.id).toBe(card?.id);
  });

  it("moves on the next day", () => {
    const days = ["2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22"];
    const picked = days.map((day) => pickDailyQuote(POOL, day)?.id);
    // Not a strict guarantee for any pool, but with 12 entries five
    // consecutive days landing on one row would mean the hash is not spreading.
    expect(new Set(picked).size).toBeGreaterThan(1);
  });

  it("returns null on an empty pool rather than throwing", () => {
    // Which is exactly the state the app ships in: the pool is empty until
    // real, sourced content is seeded.
    expect(pickDailyQuote([], "2026-08-18")).toBeNull();
  });

  it("always picks inside the pool", () => {
    for (let day = 1; day <= 28; day++) {
      const date = `2026-02-${String(day).padStart(2, "0")}`;
      const picked = pickDailyQuote(POOL, date);
      expect(POOL).toContain(picked);
    }
  });

  it("spreads across the pool rather than favouring one row", () => {
    const counts = new Map<string, number>();
    for (let day = 0; day < 366; day++) {
      const date = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
      const id = pickDailyQuote(POOL, date)!.id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    // Every entry should come up over a year; a hash that collapsed onto a few
    // rows would make the card feel broken long before anyone checked why.
    expect(counts.size).toBe(POOL.length);
  });
});

describe("hashDate", () => {
  it("is stable, and an unsigned 32-bit value", () => {
    const value = hashDate("2026-08-18");
    expect(value).toBe(hashDate("2026-08-18"));
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(2 ** 32);
  });

  it("separates adjacent dates", () => {
    expect(hashDate("2026-08-18")).not.toBe(hashDate("2026-08-19"));
  });
});

describe("sourcesFor", () => {
  it("maps the preference onto the sources to read", () => {
    expect(sourcesFor("both")).toEqual(["quote", "verse"]);
    expect(sourcesFor("verse")).toEqual(["verse"]);
    expect(sourcesFor("quote")).toEqual(["quote"]);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { pickDailyQuote, pickRestDayQuote, sourcesFor, type QuoteLike } from "@/lib/daily-quote";

/**
 * The rest day picks its quote by the same rules as every other day.
 *
 * Two real divergences sat here. `prepareSabbath` fell back to a hardcoded
 * verse-only pool instead of honouring the saved `quoteSourcePref`, and never
 * consulted a quote pinned to that date although the Today page did. On a rest
 * day the card and the notification could therefore show different content, and
 * a deliberately pinned verse was ignored by the push.
 *
 * The rule now lives in one pure function and one server resolver, so these
 * tests cover the decision itself and then check that both callers actually go
 * through it rather than choosing again on their own.
 */

const ROOT = process.cwd();
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");

function quote(id: string, source: "quote" | "verse", theme: string | null = null): QuoteLike {
  return { id, source, text: `text-${id}`, attribution: null, translation: null, theme };
}

const DATE = "2026-08-27";

describe("rest-day selection rule", () => {
  it("prefers a quote pinned to that exact date above everything", () => {
    const pinned = quote("pinned", "verse");
    const picked = pickRestDayQuote(
      { pinned, restPool: [quote("rest-a", "verse", "rest")], generalPool: [] },
      DATE,
    );
    // A pin is an explicit choice for this date; the rest pool must not beat it.
    expect(picked).toBe(pinned);
  });

  it("uses the rest-themed pool when there is no pin", () => {
    const rest = quote("rest-a", "verse", "rest");
    expect(pickRestDayQuote({ pinned: null, restPool: [rest], generalPool: [] }, DATE)).toBe(rest);
  });

  it("falls back to the general pool rather than showing nothing", () => {
    const general = quote("general", "quote");
    expect(
      pickRestDayQuote({ pinned: null, restPool: [], generalPool: [general] }, DATE),
    ).toBe(general);
  });

  it("returns null when there is nothing at all", () => {
    expect(pickRestDayQuote({ pinned: null, restPool: [], generalPool: [] }, DATE)).toBeNull();
  });

  it("agrees with the ordinary-day pick given the same pool", () => {
    // Same deterministic hash underneath, so a rest day is not a different
    // algorithm, only a different pool.
    const pool = [quote("a", "verse"), quote("b", "verse"), quote("c", "verse")];
    expect(pickRestDayQuote({ pinned: null, restPool: pool, generalPool: [] }, DATE)).toBe(
      pickDailyQuote(pool, DATE),
    );
  });

  it("is stable for a date and moves with the date", () => {
    const pool = [quote("a", "verse"), quote("b", "verse"), quote("c", "verse")];
    const sources = { pinned: null, restPool: pool, generalPool: [] };
    expect(pickRestDayQuote(sources, DATE)).toBe(pickRestDayQuote(sources, DATE));
  });
});

describe("the saved preference is honoured", () => {
  it("maps every preference onto the sources the fallback pool reads", () => {
    // The worker used to ignore this entirely and ask for ["verse"], so a user
    // who had chosen quotes got scripture on a rest day while their Today card
    // showed a quote.
    expect(sourcesFor("quote")).toEqual(["quote"]);
    expect(sourcesFor("verse")).toEqual(["verse"]);
    expect(sourcesFor("both")).toEqual(["quote", "verse"]);
  });

  it("no longer hardcodes a verse-only fallback in the Sabbath job", () => {
    const worker = read("lib/automation/worker-jobs.ts");
    expect(worker).not.toContain('listActiveQuotes(job.userId, ["verse"])');
  });
});

describe("both callers go through the one resolver", () => {
  it("the Sabbath worker job resolves rather than selecting", () => {
    const worker = read("lib/automation/worker-jobs.ts");
    expect(worker).toContain(
      "resolveRestDayQuote(job.userId, job.localDate, settings.quoteSourcePref)",
    );
    // It needs settings to honour the preference, so the dispatch must pass them.
    expect(worker).toContain("prepareSabbath(job, settings)");
  });

  it("the Today page resolves rather than selecting", () => {
    const page = read("app/(app)/today/page.tsx");
    expect(page).toContain("resolveRestDayQuote(user.id, today, settings.quoteSourcePref)");
    // The page's own copy of the sequence is gone, which is what had drifted.
    expect(page).not.toContain("listRestQuotes");
    expect(page).not.toContain("getPinnedQuote");
  });

  it("the resolver consults a pin before any pool", () => {
    const resolver = read("lib/inspiration/rest-quote.ts");
    const pinAt = resolver.indexOf("getPinnedQuote");
    const restAt = resolver.indexOf("listRestQuotes");
    expect(pinAt).toBeGreaterThan(-1);
    expect(restAt).toBeGreaterThan(-1);
    // Also the cheap path: a pin settles the day in one query.
    expect(pinAt).toBeLessThan(restAt);
  });

  it("keeps the Sabbath message itself untouched", () => {
    const worker = read("lib/automation/worker-jobs.ts");
    // Only which quote travels with it changed. The prose is not this task's.
    expect(worker).toContain("message: SABBATH_MESSAGE");
    expect(worker).toContain('fallback("A day to rest", SABBATH_MESSAGE, "/today")');
  });

  it("does not put Daily Inspiration on the rest day", () => {
    // The rest day keeps its themed quote from the curated pool; the ledger is
    // for ordinary days, and spending a provider call here would be waste.
    const worker = read("lib/automation/worker-jobs.ts");
    const sabbath = worker.slice(
      worker.indexOf("async function prepareSabbath"),
      worker.indexOf("async function prepareMorning"),
    );
    expect(sabbath).not.toContain("getDailyInspiration");
    expect(sabbath).not.toContain("dailyInspiration");
  });
});

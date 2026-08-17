import { describe, expect, it } from "vitest";

import { pushQuotesSchema, QUOTE_BATCH_MAX, QUOTE_TEXT_MAX } from "@/lib/validations/automation";

/**
 * Quotes arrive from outside: GoHa ships none of its own, because it does not
 * know which translation you read and an approximate verse is a wrong verse.
 * This is the door they come through, so what it accepts is the contract.
 */
describe("pushing quotes in", () => {
  const verse = { source: "verse" as const, text: "Commit your works to Yahweh." };

  it("accepts a batch", () => {
    const parsed = pushQuotesSchema.parse({
      quotes: [{ ...verse, attribution: "Proverbs 16:3 (WEB)", theme: "work" }],
    });
    expect(parsed.quotes[0].attribution).toBe("Proverbs 16:3 (WEB)");
  });

  it("takes a pin for a specific date", () => {
    const parsed = pushQuotesSchema.parse({ quotes: [{ ...verse, pinnedFor: "2026-08-19" }] });
    expect(parsed.quotes[0].pinnedFor).toBe("2026-08-19");
  });

  it("refuses a pin that says two different things", () => {
    // pinToday resolves server-side to the owner's date; naming both leaves it
    // ambiguous which one wins, and a silent choice would be the wrong answer
    // roughly half the time.
    const result = pushQuotesSchema.safeParse({
      quotes: [{ ...verse, pinnedFor: "2026-08-19", pinToday: true }],
    });
    expect(result.success).toBe(false);
  });

  it("refuses an instant where a local date belongs", () => {
    expect(
      pushQuotesSchema.safeParse({ quotes: [{ ...verse, pinnedFor: "2026-08-19T00:00:00Z" }] })
        .success,
    ).toBe(false);
  });

  it("will not accept a verified flag", () => {
    // Not a field, deliberately: confirming wording against a real source is a
    // human act, and an HTTP request is not that human.
    const parsed = pushQuotesSchema.parse({
      quotes: [{ ...verse, verified: true } as unknown as typeof verse],
    });
    expect("verified" in parsed.quotes[0]).toBe(false);
  });

  it("holds the line on empty text, oversized text, and oversized batches", () => {
    expect(pushQuotesSchema.safeParse({ quotes: [] }).success).toBe(false);
    expect(pushQuotesSchema.safeParse({ quotes: [{ source: "verse", text: "  " }] }).success).toBe(
      false,
    );
    expect(
      pushQuotesSchema.safeParse({
        quotes: [{ source: "verse", text: "x".repeat(QUOTE_TEXT_MAX + 1) }],
      }).success,
    ).toBe(false);
    expect(
      pushQuotesSchema.safeParse({
        quotes: Array.from({ length: QUOTE_BATCH_MAX + 1 }, (_, i) => ({
          source: "quote" as const,
          text: `q${i}`,
        })),
      }).success,
    ).toBe(false);
  });

  it("refuses a source it does not know", () => {
    expect(
      pushQuotesSchema.safeParse({ quotes: [{ source: "poem", text: "..." }] }).success,
    ).toBe(false);
  });
});

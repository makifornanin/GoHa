import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { toInspirationPayload, type DailyInspiration } from "@/lib/inspiration/resolve";

/**
 * The contract between GoHa and the n8n workflow, and the boundary that keeps
 * the providers server-side.
 *
 * GoHa supplies structured data only. It does not compose the sentence, add a
 * greeting, or decide wording; that stays in the workflow, so these tests check
 * the SHAPE and who carries it, never any prose.
 */

const ROOT = process.cwd();
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");

const RECORD: DailyInspiration = {
  id: "row-1",
  userId: "user-a",
  localDate: "2026-08-27",
  type: "bible_verse",
  text: "Commit your deeds to Yahweh, and your plans shall succeed.",
  source: "Proverbs 16:3",
  translation: "WEB",
  provider: "bible_api",
};

describe("Morning Brief carries the canonical record", () => {
  it("declares dailyInspiration on the payload type", () => {
    const brief = read("lib/automation/brief.ts");
    expect(brief).toContain("dailyInspiration: DailyInspirationPayload | null;");
    expect(brief).toContain("dailyInspiration: params.dailyInspiration ?? null,");
  });

  it("passes the stored record through verbatim, not a second lookup", () => {
    const worker = read("lib/automation/worker-jobs.ts");
    // The worker resolves through the one shared server entry point, so it gets
    // the same row the Today page reads rather than fetching its own.
    expect(worker).toContain("getDailyInspiration(job.userId, job.localDate)");
    expect(worker).toContain("toInspirationPayload");
  });

  it("emits exactly the agreed fields", () => {
    expect(toInspirationPayload(RECORD)).toEqual({
      type: "bible_verse",
      text: "Commit your deeds to Yahweh, and your plans shall succeed.",
      source: "Proverbs 16:3",
      translation: "WEB",
      provider: "bible_api",
    });
  });

  it("degrades to null rather than failing the morning job", () => {
    const worker = read("lib/automation/worker-jobs.ts");
    // A brief without an inspiration beats no brief at all.
    expect(worker).toMatch(/let dailyInspiration = null;[\s\S]*?catch \(error\) \{/);
  });
});

describe("Evening Summary does not receive it", () => {
  it("has no inspiration field anywhere in the evening payload", () => {
    const evening = read("lib/automation/evening.ts");
    // Locked deliberately: the evening is for what actually happened, and the
    // audit confirmed it never carried a quote either.
    expect(evening.toLowerCase()).not.toContain("inspiration");
    expect(evening.toLowerCase()).not.toContain("dailyinspiration");
  });

  it("does not import the resolver", () => {
    expect(read("lib/automation/evening.ts")).not.toContain("lib/inspiration");
  });
});

describe("providers are never reachable from the browser", () => {
  it("keeps the one entry point server-only", () => {
    const daily = read("lib/inspiration/daily.ts");
    // `server-only` turns a client import into a build failure rather than a
    // browser-side request to a quote provider.
    expect(daily.startsWith('import "server-only";')).toBe(true);
  });

  it("keeps the repository server-only", () => {
    expect(read("db/repositories/inspirations.ts").startsWith('import "server-only";')).toBe(true);
  });

  it("is not imported by any client component", () => {
    // The card takes plain props and renders them; it must never reach for
    // content itself, which is what would ship a provider call to the client.
    const card = read("components/today/daily-inspiration-card.tsx");
    expect(card).not.toContain("use client");
    expect(card).not.toContain("lib/inspiration/providers");
    expect(card).not.toContain("lib/inspiration/daily");
    expect(card).not.toContain("fetch(");
  });

  it("resolves only from server files", () => {
    // Today is a Server Component and worker-jobs runs on the worker surface.
    expect(read("app/(app)/today/page.tsx")).not.toContain('"use client"');
    for (const file of ["app/(app)/today/page.tsx", "lib/automation/worker-jobs.ts"]) {
      expect(read(file)).toContain("getDailyInspiration");
    }
  });

  it("hits the documented provider URLs and nothing else", () => {
    const providers = read("lib/inspiration/providers.ts");
    const urls = providers.match(/https?:\/\/[^"'\s]+/g) ?? [];
    expect(new Set(urls)).toEqual(
      new Set([
        "https://quoteslate.vercel.app/api/quotes/random",
        "https://zenquotes.io/api/random",
        // The Berean Standard Bible: modern, readable, and public domain since
        // 30 April 2023, so quoting it needs no licence and no key.
        "https://bible.helloao.org/api/BSB",
        // The previous provider, kept as the fallback link in the chain. The
        // BASE, not the random endpoint: it is asked for the same curated
        // reference the BSB was asked for.
        "https://bible-api.com",
      ]),
    );
  });

  it("needs no API key for either provider", () => {
    const providers = read("lib/inspiration/providers.ts");
    // Neither endpoint requires credentials, so none are read or sent.
    expect(providers).not.toContain("process.env");
    expect(providers.toLowerCase()).not.toContain("authorization");
    expect(providers.toLowerCase()).not.toContain("api_key");
  });
});

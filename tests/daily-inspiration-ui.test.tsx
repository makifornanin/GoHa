import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * The card now carries the takeaway composer, which imports a Server Action.
 * Under Next that import is replaced with a reference and the server module
 * never reaches the browser; under Vitest it is followed for real, so the
 * `server-only` guard fires. Mocked here the same way the worker tests do it.
 */
vi.mock("server-only", () => ({}));

import { DailyInspirationCard } from "@/components/today/daily-inspiration-card";

/**
 * The Today card.
 *
 * One item is shown, never a quote AND a verse: the record it receives is the
 * single canonical row for the day, and the card's job is to render exactly
 * that. The attribution formats differ (an author stands alone, scripture
 * carries its translation), so both are checked.
 */

afterEach(cleanup);

describe("Daily Inspiration card", () => {
  it("renders a quote with its author", () => {
    render(
      <DailyInspirationCard
        inspiration={{
          type: "quote",
          text: "Small progress is still progress.",
          source: "Ada Lovelace",
          translation: null,
        }}
      />,
    );

    expect(screen.getByText(/Small progress is still progress\./)).toBeTruthy();
    expect(screen.getByText(/Ada Lovelace/)).toBeTruthy();
    // A quote is not scripture, so nothing claims a translation.
    expect(screen.queryByText(/WEB/)).toBeNull();
  });

  it("renders a Bible verse with its reference and translation", () => {
    render(
      <DailyInspirationCard
        inspiration={{
          type: "bible_verse",
          text: "I can do all things through Christ, who strengthens me.",
          source: "Philippians 4:13",
          translation: "WEB",
        }}
      />,
    );

    expect(screen.getByText(/I can do all things/)).toBeTruthy();
    expect(screen.getByText(/Philippians 4:13/)).toBeTruthy();
    expect(screen.getByText(/WEB/)).toBeTruthy();
  });

  it("shows exactly one item, never both kinds at once", () => {
    const { container } = render(
      <DailyInspirationCard
        inspiration={{
          type: "quote",
          text: "Well begun is half done.",
          source: "Aristotle",
          translation: null,
        }}
      />,
    );
    expect(container.querySelectorAll("blockquote")).toHaveLength(1);
    expect(container.querySelectorAll("figure")).toHaveLength(1);
  });

  it("uses semantic quotation markup so the text is announced as a quotation", () => {
    const { container } = render(
      <DailyInspirationCard
        inspiration={{ type: "quote", text: "Little by little.", source: "Tolkien" }}
      />,
    );
    expect(container.querySelector("figure > blockquote")).not.toBeNull();
    expect(container.querySelector("figcaption")).not.toBeNull();
  });

  it("renders an honest empty state rather than a blank card", () => {
    render(<DailyInspirationCard inspiration={null} />);
    // CLAUDE.md section 9: no blank panels, no endless skeleton.
    expect(screen.getByText(/Today's inspiration will appear here\./)).toBeTruthy();
  });

  it("carries no hard-coded colour, so light and dark both follow the theme", () => {
    const { container } = render(
      <DailyInspirationCard
        inspiration={{ type: "bible_verse", text: "This is the day.", source: "Psalms 118:24", translation: "WEB" }}
      />,
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toMatch(/\b(rgb|hsl)a?\(/);
  });
});

describe("provider attribution", () => {
  it("credits ZenQuotes with a link, as its free tier requires", () => {
    render(
      <DailyInspirationCard
        inspiration={{
          type: "quote",
          text: "Be mindful. Be grateful.",
          source: "Unknown",
          provider: "zenquotes",
        }}
      />,
    );
    const link = screen.getByRole("link", { name: "ZenQuotes" });
    expect(link.getAttribute("href")).toBe("https://zenquotes.io/");
    // Opening a third-party site from our page: no window.opener handed over.
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("keeps the credit quieter than the author", () => {
    const { container } = render(
      <DailyInspirationCard
        inspiration={{ type: "quote", text: "Be kind.", source: "Ada", provider: "zenquotes" }}
      />,
    );
    // The author is what the reader came for; the API that served it is not.
    const credit = screen.getByRole("link", { name: "ZenQuotes" }).parentElement;
    expect(credit?.className).toContain("text-label-tertiary");
    expect(container.querySelector("figcaption")?.className).toContain("text-footnote");
  });

  it("shows no credit for public-domain scripture", () => {
    render(
      <DailyInspirationCard
        inspiration={{
          type: "bible_verse",
          text: "This is the day.",
          source: "Psalms 118:24",
          translation: "WEB",
          provider: "bible_api",
        }}
      />,
    );
    // The World English Bible is public domain and asks for nothing.
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows no credit for our own curated pool", () => {
    render(
      <DailyInspirationCard
        inspiration={{ type: "quote", text: "Well begun.", source: "Aristotle", provider: "goha_fallback" }}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
  });
});

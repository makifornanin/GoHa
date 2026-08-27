import { BookOpen, Quote } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

/** Exactly what the card needs. Ids, dates and provider stay server-side. */
export type DailyInspirationView = {
  type: "quote" | "bible_verse";
  text: string;
  source: string;
  translation?: string | null;
  /** Which system produced it. Drives the provider credit below. */
  provider?: string | null;
};

/**
 * Providers whose terms require visible credit where their content is shown.
 *
 * ZenQuotes asks for it on the free tier, so this is an obligation rather than
 * a courtesy. Keyed by provider so adding one later means adding a row here,
 * not another branch in the markup.
 *
 * bible-api.com serves the World English Bible, which is public domain and
 * needs no credit, and the curated local pool is ours; neither appears here.
 */
const PROVIDER_CREDIT: Record<string, { label: string; href: string }> = {
  zenquotes: { label: "ZenQuotes", href: "https://zenquotes.io/" },
};

/**
 * The day's one inspiration, under Momentum.
 *
 * ONE item, never both a quote and a verse: the record it renders is the same
 * row the Morning Brief payload carries, so what the card says and what the
 * notification was built from cannot diverge.
 *
 * Deliberately quiet. It sits in a column beside real work, so it is a single
 * card with body-sized text and a footnote attribution rather than a hero
 * panel. Server-rendered with no loading state: something that fades in after
 * the dashboard draws the eye, which is the opposite of what this is for.
 *
 * Colour comes only from tokens (`text-label`, `text-label-secondary`), so
 * light and dark both follow the theme with no per-mode branch here.
 */
export function DailyInspirationCard({
  inspiration,
}: {
  inspiration?: DailyInspirationView | null;
}) {
  if (!inspiration) {
    return (
      <Card>
        <CardContent className="flex items-start gap-2.5 py-4">
          <Quote className="mt-0.5 size-4 shrink-0 text-label-quaternary" aria-hidden />
          <p className="text-callout text-label-tertiary">
            Today&apos;s inspiration will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const isVerse = inspiration.type === "bible_verse";
  const Icon = isVerse ? BookOpen : Quote;
  const credit = inspiration.provider ? PROVIDER_CREDIT[inspiration.provider] : undefined;

  return (
    <Card>
      <CardContent className="flex gap-3 py-4">
        <Icon className="mt-0.5 size-4 shrink-0 text-label-quaternary" aria-hidden />
        {/* `min-w-0` lets long unbroken references wrap instead of widening the
            column and pushing the dashboard sideways on a narrow phone. */}
        <figure className="flex min-w-0 flex-1 flex-col gap-2">
          {/*
            `text-pretty` keeps a one-word last line from happening, and
            `hyphens-none` stops a long book name being broken across lines on a
            narrow phone. The quotation is body-sized: readable, but the same
            weight as the rest of the dashboard so it does not become a poster.
          */}
          <blockquote className="hyphens-none text-pretty text-body leading-relaxed text-label">
            {isVerse ? inspiration.text : `“${inspiration.text}”`}
          </blockquote>
          <figcaption className="text-footnote text-label-secondary">
            {/* An em dash is the typographic convention for an attribution, so
                the EN dash keeps the same reading without the forbidden glyph. */}
            <span aria-hidden>{"– "}</span>
            {inspiration.source}
            {inspiration.translation ? (
              <span className="text-label-tertiary">
                {" · "}
                {inspiration.translation}
              </span>
            ) : null}
            {credit ? (
              /* Required credit, kept quiet: tertiary label, same footnote size,
                 after the attribution rather than competing with it. The author
                 is what the reader came for, not the API that served them. */
              <span className="text-label-tertiary">
                {" · via "}
                <a
                  href={credit.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-label-secondary"
                >
                  {credit.label}
                </a>
              </span>
            ) : null}
          </figcaption>
        </figure>
      </CardContent>
    </Card>
  );
}

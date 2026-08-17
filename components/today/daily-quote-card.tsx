import { Quote } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export type DailyQuote = {
  text: string;
  attribution: string | null;
  translation: string | null;
};

/**
 * The daily quote or verse, under Momentum (automation Guide 01, phase 1.5).
 *
 * The pool it reads from does not exist yet: `daily_quotes` arrives with
 * Foundations phase A, and the deterministic date-hash pick with it. Until
 * then this renders its empty state, which is the honest thing to show and
 * also the reason to build the card now: the layout below Momentum is settled,
 * so filling it later changes nothing on this page.
 *
 * Server-rendered with no loading state, because a quote that fades in after
 * the rest of the dashboard draws attention to itself, which is the opposite
 * of what a quote is for here.
 */
export function DailyQuoteCard({ quote }: { quote?: DailyQuote | null }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-4">
        {quote ? (
          <>
            <p className="text-body text-label">{quote.text}</p>
            {quote.attribution ? (
              <p className="text-footnote text-label-secondary">{quote.attribution}</p>
            ) : null}
            {quote.translation ? (
              <p className="text-footnote text-label-tertiary">{quote.translation}</p>
            ) : null}
          </>
        ) : (
          <div className="flex items-start gap-2.5">
            <Quote className="mt-0.5 size-4 shrink-0 text-label-quaternary" aria-hidden />
            <p className="text-callout text-label-tertiary">
              No quote for today. This card fills itself once the daily pool is set up.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

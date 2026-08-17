"use client";

import { Flame, Timer, TrendingUp } from "lucide-react";
import Link from "next/link";

import { Sparkline } from "@/components/charts/bar-series";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDurationHm } from "@/lib/focus";
import { cn } from "@/lib/utils";

export type MomentumData = {
  /** Best CURRENT streak across habits, and which habit holds it. */
  streakDays: number;
  streakHabit: string | null;
  /** Tasks completed per day for the last 7 days, oldest first. */
  weekCompletions: number[];
  weekTotal: number;
  /** Same window, previous week, for the comparison line. */
  prevWeekTotal: number;
  focusSecondsToday: number;
  focusSecondsWeek: number;
};

/**
 * The evening answer to "did today matter?".
 *
 * Today could say what was left but never what had been built up, so there was
 * nothing to come back for once the list was empty. Three numbers only, all
 * already in the database: the streak being protected, the week's shape, and
 * time actually spent focused. It links to Progress rather than growing into it.
 */
export function MomentumCard({ data }: { data: MomentumData }) {
  const { streakDays, weekTotal, prevWeekTotal, focusSecondsToday, focusSecondsWeek } = data;
  const diff = weekTotal - prevWeekTotal;
  const hasAnything =
    streakDays > 0 || weekTotal > 0 || focusSecondsWeek > 0 || prevWeekTotal > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="size-4 text-label-secondary" aria-hidden />
          Momentum
        </CardTitle>
        {/* `py-1.5 -my-1.5` grows the tap area from 18px to 30px without moving
            anything: the padding is cancelled by the negative margin, so the
            header keeps its height and only the target gets bigger. */}
        <Link
          href="/progress"
          className="-my-1.5 rounded-sm px-1 py-1.5 text-callout font-medium text-blue hover:underline"
        >
          Details
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-3.5">
        {!hasAnything ? (
          <p className="rounded-xl bg-fill-quaternary px-4 py-5 text-center text-callout text-label-secondary">
            Finish a task or run a focus session and your momentum starts showing here.
          </p>
        ) : (
          <>
            {/* Streak: the thing most worth not breaking. */}
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-callout text-label-secondary">
                <Flame
                  className={cn("size-4", streakDays > 0 ? "text-orange" : "text-label-tertiary")}
                  aria-hidden
                />
                Streak
              </span>
              <span className="min-w-0 text-right">
                <span className="font-mono text-body tabular-nums text-label">
                  {streakDays} {streakDays === 1 ? "day" : "days"}
                </span>
                {data.streakHabit ? (
                  <span className="block truncate text-footnote text-label-tertiary">
                    {data.streakHabit}
                  </span>
                ) : null}
              </span>
            </div>

            {/* This week's shape, not just its total. */}
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="text-callout text-label-secondary">This week</span>
                <span className="font-mono text-body tabular-nums text-label">
                  {weekTotal} done
                </span>
              </div>
              <Sparkline values={data.weekCompletions} />
              <p className="mt-1 text-footnote text-label-tertiary">
                {prevWeekTotal === 0 && weekTotal === 0
                  ? "Nothing completed in the last two weeks."
                  : diff === 0
                    ? "Level with last week."
                    : diff > 0
                      ? `${diff} more than last week.`
                      : `${Math.abs(diff)} fewer than last week.`}
              </p>
            </div>

            {/* Focus time, the one metric that cannot be gamed by adding tasks. */}
            <div className="flex items-center justify-between gap-3 border-t border-separator pt-3">
              <span className="flex items-center gap-2 text-callout text-label-secondary">
                <Timer className="size-4 text-label-tertiary" aria-hidden />
                Focus
              </span>
              <span className="text-right">
                <span className="font-mono text-body tabular-nums text-label">
                  {formatDurationHm(focusSecondsToday)}
                </span>
                <span className="block text-footnote text-label-tertiary">
                  {formatDurationHm(focusSecondsWeek)} this week
                </span>
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { CheckCircle2, Flame, Target, Timer } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { BarSeries, type SeriesPoint } from "@/components/charts/bar-series";
import { HabitHeatmap } from "@/components/charts/habit-heatmap";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Weekday } from "@/lib/date";
import { formatDurationHm } from "@/lib/focus";
import { deltaPercent, type DayPoint, type HeatCell, type WeekPoint } from "@/lib/progress";
import { cn } from "@/lib/utils";

export type ProgressData = {
  weeklyCompletions: WeekPoint[];
  weeklyFocusMinutes: WeekPoint[];
  dailyFocusMinutes: DayPoint[];
  heatmap: HeatCell[];
  today: string;
  weekStartsOn: Weekday;
  /** Human range covered by the weekly charts, e.g. "May 25 – Aug 13". */
  rangeLabel: string;
  /** Human range covered by the heatmap, which spans further back. */
  heatmapRangeLabel: string;
  summary: {
    tasksCompleted: number;
    tasksCompletedPrev: number;
    focusSeconds: number;
    focusSecondsPrev: number;
    habitRate: number;
    habitRatePrev: number;
    bestStreak: number;
    activeGoals: number;
    goalsCompleted: number;
  };
  hasAnyHistory: boolean;
};

function Delta({ value, suffix = "%" }: { value: number | null; suffix?: string }) {
  // null means there is no earlier period to compare against. Calling that
  // "no change" claims a comparison that was never made.
  if (value === null) {
    return <span className="text-footnote text-label-tertiary">no earlier data</span>;
  }
  if (value === 0) {
    return <span className="text-footnote text-label-tertiary">no change</span>;
  }
  const up = value > 0;
  return (
    <span className={cn("text-footnote tabular-nums", up ? "text-green" : "text-label-secondary")}>
      {up ? "+" : ""}
      {value}
      {suffix} vs previous
    </span>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  delta,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  delta?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption uppercase text-label-secondary">{label}</p>
          <p className="mt-1 font-mono text-title-2 tabular-nums text-label">{value}</p>
          {delta ? <div className="mt-1">{delta}</div> : null}
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-fill-tertiary text-label-secondary">
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
    </Card>
  );
}

/**
 * The history screen.
 *
 * Everything here is derived from records the app was already writing and never
 * showing back: completed-task timestamps, focus session durations, habit
 * entries. That is the point of the page. Nothing is stored for it, and nothing
 * is estimated: a week with no data reads as zero, not as a gap.
 */
export function ProgressView({ data }: { data: ProgressData }) {
  const { summary } = data;

  if (!data.hasAnyHistory) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Progress"
          description="How your work, focus, and habits have actually gone over time."
        />
        <EmptyState
          icon={Target}
          title="Nothing to chart yet"
          description="Complete a task, run a focus session, or check in on a habit. This page fills itself in from what you do, so there is nothing to set up."
        />
      </div>
    );
  }

  const completionPoints: SeriesPoint[] = data.weeklyCompletions.map((w, i) => ({
    label: w.label,
    value: w.value,
    emphasis: i === data.weeklyCompletions.length - 1,
  }));
  const focusPoints: SeriesPoint[] = data.weeklyFocusMinutes.map((w, i) => ({
    label: w.label,
    value: w.value,
    emphasis: i === data.weeklyFocusMinutes.length - 1,
  }));

  const totalCompletions = data.weeklyCompletions.reduce((sum, w) => sum + w.value, 0);
  const totalFocus = data.weeklyFocusMinutes.reduce((sum, w) => sum + w.value, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Progress"
        description="How your work, focus, and habits have actually gone over time."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={CheckCircle2}
          label="Tasks done"
          value={String(summary.tasksCompleted)}
          delta={<Delta value={deltaPercent(summary.tasksCompleted, summary.tasksCompletedPrev)} />}
        />
        <StatTile
          icon={Timer}
          label="Focus time"
          value={formatDurationHm(summary.focusSeconds)}
          delta={<Delta value={deltaPercent(summary.focusSeconds, summary.focusSecondsPrev)} />}
        />
        <StatTile
          icon={Flame}
          label="Habit rate"
          value={`${summary.habitRate}%`}
          delta={
            <Delta
              value={
                summary.habitRatePrev === 0 && summary.habitRate === 0
                  ? 0
                  : summary.habitRate - summary.habitRatePrev
              }
              suffix=" pts"
            />
          }
        />
        <StatTile
          icon={Target}
          label="Best streak"
          value={`${summary.bestStreak} ${summary.bestStreak === 1 ? "day" : "days"}`}
          delta={
            <span className="text-footnote text-label-tertiary">
              {summary.activeGoals} active goal{summary.activeGoals === 1 ? "" : "s"}
            </span>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle>Tasks completed by week</CardTitle>
              {/* The axis shows day numbers only, so the range lives here. */}
              <p className="mt-0.5 font-mono text-footnote tabular-nums text-label-tertiary">
                {data.rangeLabel}
              </p>
            </div>
            <span className="shrink-0 font-mono text-footnote tabular-nums text-label-secondary">
              {totalCompletions} total
            </span>
          </CardHeader>
          <CardContent>
            {totalCompletions === 0 ? (
              <p className="rounded-xl bg-fill-quaternary px-4 py-8 text-center text-callout text-label-secondary">
                No tasks completed in this window yet.
              </p>
            ) : (
              <BarSeries points={completionPoints} unit=" tasks" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle>Focus minutes by week</CardTitle>
              <p className="mt-0.5 font-mono text-footnote tabular-nums text-label-tertiary">
                {data.rangeLabel}
              </p>
            </div>
            <span className="shrink-0 font-mono text-footnote tabular-nums text-label-secondary">
              {formatDurationHm(totalFocus * 60)} total
            </span>
          </CardHeader>
          <CardContent>
            {totalFocus === 0 ? (
              <p className="rounded-xl bg-fill-quaternary px-4 py-8 text-center text-callout text-label-secondary">
                No focus sessions recorded yet. Start one from Focus.
              </p>
            ) : (
              <BarSeries
                points={focusPoints}
                unit=" min"
                barClassName="bg-indigo"
                emphasisClassName="bg-indigo"
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Habit consistency</CardTitle>
            <p className="mt-0.5 font-mono text-footnote tabular-nums text-label-tertiary">
              {data.heatmapRangeLabel}
            </p>
          </div>
          <span className="shrink-0 font-mono text-footnote tabular-nums text-label-secondary">
            {summary.habitRate}% of scheduled check-ins
          </span>
        </CardHeader>
        <CardContent>
          {data.heatmap.every((c) => c.scheduled === 0) ? (
            <p className="rounded-xl bg-fill-quaternary px-4 py-8 text-center text-callout text-label-secondary">
              No habits scheduled in this window. Create one from Habits and it starts filling in.
            </p>
          ) : (
            <HabitHeatmap
              cells={data.heatmap}
              today={data.today}
              weekStartsOn={data.weekStartsOn}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

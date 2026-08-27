"use client";

import { motion } from "motion/react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flame,
  RotateCcw,
  Timer,
  TriangleAlert,
  Trophy,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { reopenWeeklyReviewAction, saveWeeklyReviewAction } from "@/app/(app)/review/actions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { LifeArea, Task, WeeklyReview } from "@/db";
import { formatIsoDateMedium } from "@/lib/date";
import { formatDurationHm } from "@/lib/focus";
import { lifeAreaColorConfig, resolveColorKey } from "@/lib/life-areas";
import { spring } from "@/lib/motion";
import { REVIEW_FIELD_MAX, type ReviewStats } from "@/lib/review";
import { cn } from "@/lib/utils";

export type ReviewData = {
  weekStart: string;
  weekEnd: string;
  /** Null when the week is the current one (no "next" to go to). */
  nextWeekStart: string | null;
  prevWeekStart: string;
  isCurrentWeek: boolean;
  stats: ReviewStats;
  review: WeeklyReview | null;
  lifeAreas: LifeArea[];
};

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-fill-quaternary p-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-label-secondary">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="font-mono text-title-3 tabular-nums text-label">{value}</p>
        <p className="text-footnote text-label-secondary">{label}</p>
        {sub ? <p className="text-footnote text-label-tertiary">{sub}</p> : null}
      </div>
    </div>
  );
}

const RATINGS = [1, 2, 3, 4, 5];

/**
 * The "Reflect" end of the chain, which had no home until now.
 *
 * The left column is what ACTUALLY happened, derived from the same records the
 * rest of the app renders; the right column is the only thing this screen
 * stores. Keeping those apart matters: reopening a task next month corrects the
 * history instead of leaving a stale number frozen in a saved snapshot.
 */
export function ReviewView({ data }: { data: ReviewData }) {
  const router = useRouter();
  const { stats, review } = data;

  /*
   * The saved values this week started from. The page keys this component on
   * the week (audit R-05), so a remount rebuilds these from the right review,
   * and after a save the revalidated props make them match state again.
   */
  const saved = {
    wins: review?.wins ?? "",
    challenges: review?.challenges ?? "",
    focusNextWeek: review?.focusNextWeek ?? "",
    rating: review?.rating ?? null,
  };

  const [wins, setWins] = useState(saved.wins);
  const [challenges, setChallenges] = useState(saved.challenges);
  const [focusNextWeek, setFocusNextWeek] = useState(saved.focusNextWeek);
  const [rating, setRating] = useState<number | null>(saved.rating);
  const [pending, startTransition] = useTransition();

  const isComplete = Boolean(review?.completedAt);
  const areaById = new Map(data.lifeAreas.map((a) => [a.id, a]));

  /** Edits not yet written to the row backing THIS week. */
  const isDirty =
    wins !== saved.wins ||
    challenges !== saved.challenges ||
    focusNextWeek !== saved.focusNextWeek ||
    rating !== saved.rating;

  /**
   * Move weeks, asking first if there is unsaved prose.
   *
   * The key fix stops unsaved text leaking into the next week's row, but it
   * also means navigating now DISCARDS it. Losing a paragraph you just wrote
   * without being asked is its own failure, so the discard is made explicit.
   */
  function goToWeek(target: string) {
    if (
      isDirty &&
      !window.confirm(
        "You have unsaved changes to this week's review.\n\nLeave without saving? Your edits will be lost.",
      )
    ) {
      return;
    }
    router.push(`/review?week=${target}`);
  }

  function save(complete: boolean) {
    startTransition(async () => {
      const result = await saveWeeklyReviewAction(
        { weekStart: data.weekStart, wins, challenges, focusNextWeek, rating },
        complete,
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(complete ? "Review complete" : "Draft saved");
    });
  }

  function reopen() {
    startTransition(async () => {
      const result = await reopenWeeklyReviewAction(data.weekStart);
      if (!result.ok) toast.error(result.error);
    });
  }

  const nothingHappened =
    stats.completed.length === 0 &&
    stats.slipped.length === 0 &&
    stats.focusSeconds === 0 &&
    stats.habitDaysScheduled === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Weekly Review"
        description="Close the loop: what happened, what slipped, and what you are carrying forward."
        action={
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous week"
              onClick={() => goToWeek(data.prevWeekStart)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next week"
              disabled={!data.nextWeekStart}
              onClick={() => data.nextWeekStart && goToWeek(data.nextWeekStart)}
            >
              <ChevronRight />
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-body tabular-nums text-label">
          {formatIsoDateMedium(data.weekStart)} – {formatIsoDateMedium(data.weekEnd)}
        </span>
        {data.isCurrentWeek ? (
          <span className="rounded-full bg-blue/12 px-2 py-0.5 text-footnote text-blue">
            This week, still in progress
          </span>
        ) : null}
        {isComplete ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green/15 px-2 py-0.5 text-footnote text-green">
            <CheckCircle2 className="size-3" aria-hidden />
            Reviewed
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* WHAT HAPPENED - derived, never stored */}
        <div className="flex flex-col gap-4 lg:col-span-7">
          <Card>
            <CardHeader>
              <CardTitle>The week in numbers</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Stat
                icon={CheckCircle2}
                label="tasks completed"
                value={String(stats.completed.length)}
              />
              <Stat
                icon={Timer}
                label="focused"
                value={formatDurationHm(stats.focusSeconds)}
                sub={`${stats.focusSessions} session${stats.focusSessions === 1 ? "" : "s"}`}
              />
              <Stat
                icon={Flame}
                label="habit check-ins"
                value={`${stats.habitRate}%`}
                sub={
                  stats.habitDaysScheduled === 0
                    ? "nothing scheduled"
                    : `${stats.habitDaysDone} of ${stats.habitDaysScheduled}`
                }
              />
              <Stat icon={Trophy} label="goals completed" value={String(stats.goalsCompleted)} />
            </CardContent>
          </Card>

          {nothingHappened ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-callout text-label-secondary">
                  Nothing was recorded in this week. Reviews get more useful once there is a week of
                  work behind them.
                </p>
              </CardContent>
            </Card>
          ) : null}

          {stats.completedByArea.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Where the effort went</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {stats.completedByArea.map(({ areaId, count }) => {
                  const area = areaId ? areaById.get(areaId) : null;
                  const color = area
                    ? lifeAreaColorConfig[resolveColorKey(area.color, area.id)]
                    : null;
                  const share = Math.round((count / stats.completed.length) * 100);
                  return (
                    <div key={areaId ?? "none"}>
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2 text-callout text-label">
                          <span
                            className={cn("size-2 shrink-0 rounded-full", color?.dot ?? "bg-gray-3")}
                            aria-hidden
                          />
                          <span className="truncate">{area?.name ?? "No life area"}</span>
                        </span>
                        <span className="shrink-0 font-mono text-footnote tabular-nums text-label-secondary">
                          {count}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-fill-tertiary">
                        <motion.div
                          className={cn("h-full rounded-full", color?.dot ?? "bg-gray-3")}
                          initial={{ width: 0 }}
                          animate={{ width: `${share}%` }}
                          transition={spring.smooth}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ) : null}

          {stats.slipped.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TriangleAlert className="size-4 text-orange" aria-hidden />
                  Still open from this week
                </CardTitle>
                <span className="font-mono text-footnote tabular-nums text-label-secondary">
                  {stats.slipped.length}
                </span>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5">
                {stats.slipped.slice(0, 10).map((task: Task) => (
                  <div key={task.id} className="flex items-center gap-2">
                    <span className="size-1.5 shrink-0 rounded-full bg-orange" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-callout text-label">
                      {task.title}
                    </span>
                  </div>
                ))}
                <Link
                  href="/tasks"
                  className="touch-target mt-1 inline-flex items-center text-callout font-medium text-blue hover:underline"
                >
                  Reschedule in To-dos
                </Link>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* THE REFLECTION - the only thing this screen stores */}
        <div className="lg:col-span-5">
          <Card>
            <CardHeader>
              <CardTitle>Your reflection</CardTitle>
              {review?.updatedAt && !isComplete ? (
                <span className="text-footnote text-label-tertiary">Draft saved</span>
              ) : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <fieldset disabled={isComplete || pending} className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-subhead text-label-secondary">What went well?</span>
                  <Textarea
                    value={wins}
                    onChange={(e) => setWins(e.target.value)}
                    maxLength={REVIEW_FIELD_MAX}
                    placeholder="The wins worth remembering."
                    className="min-h-20"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-subhead text-label-secondary">What got in the way?</span>
                  <Textarea
                    value={challenges}
                    onChange={(e) => setChallenges(e.target.value)}
                    maxLength={REVIEW_FIELD_MAX}
                    placeholder="Be specific. Vague blockers repeat."
                    className="min-h-20"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-subhead text-label-secondary">Focus for next week</span>
                  <Textarea
                    value={focusNextWeek}
                    onChange={(e) => setFocusNextWeek(e.target.value)}
                    maxLength={REVIEW_FIELD_MAX}
                    placeholder="One or two intentions, not a list."
                    className="min-h-20"
                  />
                </label>

                <div>
                  <span className="mb-1.5 block text-subhead text-label-secondary">
                    How did the week feel?
                  </span>
                  <div className="flex items-center gap-1" role="radiogroup" aria-label="Week rating">
                    {RATINGS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={rating === value}
                        aria-label={`${value} out of 5`}
                        onClick={() => setRating(rating === value ? null : value)}
                        className={cn(
                          "touch-target hit-44-narrow h-9 flex-1 cursor-pointer rounded-lg text-body font-medium transition-colors focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40",
                          rating === value
                            ? "bg-blue-fill text-white"
                            : "bg-fill-tertiary text-label-secondary hover:bg-fill-secondary",
                        )}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              </fieldset>

              <div className="flex items-center justify-end gap-2 border-t border-separator pt-4">
                {isComplete ? (
                  <Button variant="ghost" onClick={reopen} loading={pending}>
                    <RotateCcw className="size-4" aria-hidden />
                    Reopen
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" onClick={() => save(false)} loading={pending}>
                      Save draft
                    </Button>
                    <Button onClick={() => save(true)} loading={pending}>
                      Complete review
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

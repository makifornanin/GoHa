import { CalendarDays, CheckCircle2, CircleOff, Clock, Flag, Shapes } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { FocusSession } from "@/db";
import { formatZonedDateTimeMedium, MANILA_TZ } from "@/lib/date";
import { formatDurationHm, type FocusBreakdown } from "@/lib/focus";
import { cn } from "@/lib/utils";

export type FocusStatsData = {
  todaySeconds: number;
  weekSeconds: number;
  byTask: FocusBreakdown[];
  byGoal: FocusBreakdown[];
  byLifeArea: FocusBreakdown[];
};

function StatTile({ icon: Icon, label, seconds }: { icon: LucideIcon; label: string; seconds: number }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-separator-opaque bg-surface p-4 shadow-e1">
      <div>
        <p className="text-caption uppercase text-label-secondary">{label}</p>
        <p className="mt-1 font-mono text-title-2 tabular-nums text-label">{formatDurationHm(seconds)}</p>
      </div>
      <span className="flex size-11 items-center justify-center rounded-full bg-surface-secondary text-label-secondary">
        <Icon className="size-5" aria-hidden />
      </span>
    </div>
  );
}

function Breakdown({ title, icon: Icon, items }: { title: string; icon: LucideIcon; items: FocusBreakdown[] }) {
  if (items.length === 0) return null;
  const max = items[0]?.seconds || 1;
  return (
    <div>
      <h4 className="mb-3 flex items-center gap-2 text-caption uppercase text-label-secondary">
        <Icon className="size-4" aria-hidden />
        {title}
      </h4>
      <ul className="flex flex-col gap-2.5">
        {items.slice(0, 5).map((item) => (
          <li key={item.id}>
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-body text-label">{item.label}</span>
              <span className="shrink-0 font-mono text-footnote tabular-nums text-label-secondary">
                {formatDurationHm(item.seconds)}
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-gray-5">
              <div className="h-full rounded-full bg-blue" style={{ width: `${(item.seconds / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FocusStats({
  stats,
  recent,
  taskTitleById,
  timeZone = MANILA_TZ,
}: {
  stats: FocusStatsData;
  recent: FocusSession[];
  taskTitleById: Map<string, string>;
  timeZone?: string;
}) {
  const hasBreakdown = stats.byTask.length + stats.byGoal.length + stats.byLifeArea.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <StatTile icon={Clock} label="Focus today" seconds={stats.todaySeconds} />
        <StatTile icon={CalendarDays} label="This week" seconds={stats.weekSeconds} />
      </div>

      {hasBreakdown ? (
        <div className="grid grid-cols-1 gap-6 rounded-2xl border border-separator-opaque bg-surface p-4 shadow-e1 md:grid-cols-3">
          <Breakdown title="By to-do" icon={CheckCircle2} items={stats.byTask} />
          <Breakdown title="By goal" icon={Flag} items={stats.byGoal} />
          <Breakdown title="By life area" icon={Shapes} items={stats.byLifeArea} />
        </div>
      ) : null}

      <section className="rounded-2xl border border-separator-opaque bg-surface shadow-e1">
        <h3 className="px-4 pt-4 text-headline text-label">Recent sessions</h3>
        <div className="px-1 pb-2 pt-3">
          {recent.length === 0 ? (
            <p className="mx-3 mb-2 rounded-xl bg-surface-secondary px-4 py-8 text-center text-callout text-label-secondary">
              No focus sessions yet. Start one above to build your focus history.
            </p>
          ) : (
            <ul className="flex flex-col">
              {recent.map((session) => {
                const abandoned = session.status === "abandoned";
                return (
                  <li
                    key={session.id}
                    className="relative flex min-h-10 items-center gap-3 rounded-xl px-3 py-1.5 [&:not(:last-child)]:after:absolute [&:not(:last-child)]:after:bottom-0 [&:not(:last-child)]:after:left-3 [&:not(:last-child)]:after:right-0 [&:not(:last-child)]:after:h-px [&:not(:last-child)]:after:bg-separator"
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full",
                        abandoned ? "bg-surface-secondary text-label-tertiary" : "bg-green/15 text-green",
                      )}
                    >
                      {abandoned ? <CircleOff className="size-4" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body text-label">
                        {session.taskId ? taskTitleById.get(session.taskId) ?? "Task" : "Open focus"}
                      </p>
                      <p className="font-mono text-footnote tabular-nums text-label-secondary">
                        {formatZonedDateTimeMedium(session.startedAt, timeZone)}
                        {abandoned ? " · abandoned" : ""}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-footnote tabular-nums text-label">
                      {formatDurationHm(session.durationSeconds ?? 0)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

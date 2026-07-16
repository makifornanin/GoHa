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
    <div className="raised card-shadow flex items-center justify-between rounded-xl border border-outline-variant/70 bg-surface-container-lowest p-5">
      <div>
        <p className="text-label-sm uppercase text-on-surface-variant">{label}</p>
        <p className="tabular mt-1 font-mono text-mono-xl text-on-surface">{formatDurationHm(seconds)}</p>
      </div>
      <span className="flex size-12 items-center justify-center rounded-lg border border-outline-variant/70 bg-surface-container text-on-surface-variant">
        <Icon className="size-6" aria-hidden />
      </span>
    </div>
  );
}

function Breakdown({ title, icon: Icon, items }: { title: string; icon: LucideIcon; items: FocusBreakdown[] }) {
  if (items.length === 0) return null;
  const max = items[0]?.seconds || 1;
  return (
    <div>
      <h4 className="mb-3 flex items-center gap-2 text-label-sm uppercase text-on-surface-variant">
        <Icon className="size-4" aria-hidden />
        {title}
      </h4>
      <ul className="flex flex-col gap-2.5">
        {items.slice(0, 5).map((item) => (
          <li key={item.id}>
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-body-md text-on-surface">{item.label}</span>
              <span className="tabular shrink-0 font-mono text-mono-sm text-on-surface-variant">
                {formatDurationHm(item.seconds)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-variant">
              <div className="h-full rounded-full bg-secondary" style={{ width: `${(item.seconds / max) * 100}%` }} />
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatTile icon={Clock} label="Focus today" seconds={stats.todaySeconds} />
        <StatTile icon={CalendarDays} label="This week" seconds={stats.weekSeconds} />
      </div>

      {hasBreakdown ? (
        <div className="raised card-shadow grid grid-cols-1 gap-6 rounded-xl border border-outline-variant/70 bg-surface-container-lowest p-6 md:grid-cols-3">
          <Breakdown title="By task" icon={CheckCircle2} items={stats.byTask} />
          <Breakdown title="By goal" icon={Flag} items={stats.byGoal} />
          <Breakdown title="By life area" icon={Shapes} items={stats.byLifeArea} />
        </div>
      ) : null}

      <section className="raised card-shadow rounded-xl border border-outline-variant/70 bg-surface-container-lowest p-6">
        <h3 className="mb-4 text-headline-md text-on-surface">Recent sessions</h3>
        {recent.length === 0 ? (
          <p className="rounded-lg border border-dashed border-outline-variant bg-surface-container-low px-4 py-8 text-center text-body-md text-on-surface-variant">
            No focus sessions yet. Start one above to build your focus history.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-outline-variant/40">
            {recent.map((session) => {
              const abandoned = session.status === "abandoned";
              return (
                <li key={session.id} className="flex items-center gap-3 py-3">
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg",
                      abandoned ? "bg-surface-container-high text-outline" : "bg-success/15 text-success",
                    )}
                  >
                    {abandoned ? <CircleOff className="size-4" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-md text-on-surface">
                      {session.taskId ? taskTitleById.get(session.taskId) ?? "Task" : "Open focus"}
                    </p>
                    <p className="tabular font-mono text-mono-sm text-on-surface-variant">
                      {formatZonedDateTimeMedium(session.startedAt, timeZone)}
                      {abandoned ? " · abandoned" : ""}
                    </p>
                  </div>
                  <span className="tabular shrink-0 font-mono text-mono-md text-on-surface">
                    {formatDurationHm(session.durationSeconds ?? 0)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

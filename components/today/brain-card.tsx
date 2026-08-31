"use client";

import { motion } from "motion/react";
import { ArrowRight, Play, Sparkles, TriangleAlert, Wand2 } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { planMyDayAction } from "@/app/(app)/today/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Task } from "@/db";
import { spring } from "@/lib/motion";
import type { DaySignal } from "@/lib/today-brain";
import { cn } from "@/lib/utils";

const STATE_STYLE = {
  late: { eyebrow: "Needs attention", tint: "text-red", icon: TriangleAlert },
  focus: { eyebrow: "Today's focus", tint: "text-blue", icon: Play },
  plan: { eyebrow: "Suggested next", tint: "text-blue", icon: Sparkles },
  clear: { eyebrow: "Today", tint: "text-label-secondary", icon: Sparkles },
  done: { eyebrow: "Today", tint: "text-green", icon: Sparkles },
} as const;

/**
 * Today's opinion, in the slot that used to hold a passive prompt.
 *
 * The old card said "No focus set. Pin a Top 3 priority..." while two overdue
 * tasks sat directly beneath it: the app had every fact it needed and asked the
 * user to do the reasoning anyway. This states a conclusion, shows the reason
 * that produced it, and offers exactly one primary action to act on it.
 */
export function BrainCard({
  signal,
  canPlan,
  onOpenTask,
}: {
  signal: DaySignal;
  /** False when all three priority slots are already taken. */
  canPlan: boolean;
  onOpenTask: (task: Task) => void;
}) {
  const [planning, startPlan] = useTransition();
  const style = STATE_STYLE[signal.state];
  const Icon = style.icon;

  function planMyDay() {
    startPlan(async () => {
      const result = await planMyDayAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const names = result.data.pinned.map((p) => `"${p.title}"`).join(", ");
      toast.success(
        result.data.pinned.length === 1 ? `Pinned ${names}` : `Pinned ${result.data.pinned.length}: ${names}`,
      );
    });
  }

  return (
    <Card className="p-4 sm:p-5">
      <p className={cn("flex items-center gap-2 text-caption uppercase", style.tint)}>
        <Icon className="size-3.5" aria-hidden />
        {style.eyebrow}
      </p>

      <h2 className="mt-3 text-title-3 text-label">{signal.headline}</h2>
      <p className="mt-1 max-w-2xl text-body text-label-secondary">{signal.detail}</p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {signal.task ? (
          <>
            {/* Carry the task through: Focus reads `?taskId=` and preselects
                it, so "Focus on this" starts on THIS task rather than dropping
                the user on an empty picker. */}
            <Link
              href={`/focus?taskId=${signal.task.id}`}
              className={buttonVariants({ size: "lg" })}
            >
              <Play className="size-4" aria-hidden />
              Focus on this
            </Link>
            <Button variant="secondary" onClick={() => onOpenTask(signal.task!)}>
              Open to-do
            </Button>
          </>
        ) : (
          <Link href="/tasks" className={buttonVariants({ size: "lg" })}>
            Plan a to-do
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}

        {canPlan && signal.suggestions.length > 0 ? (
          <Button variant="ghost" onClick={planMyDay} loading={planning}>
            <Wand2 className="size-4" aria-hidden />
            Plan my day
          </Button>
        ) : null}

        {signal.canReflect ? (
          <Link
            href="/progress"
            className={cn(buttonVariants({ variant: "ghost" }), "text-label-secondary")}
          >
            Look back
          </Link>
        ) : null}
      </div>

      {/* What "Plan my day" would actually pick, shown before it is pressed.
          A one-tap action that silently decides for you is worse than no action. */}
      {canPlan && signal.suggestions.length > 0 ? (
        <motion.ul
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.smooth}
          className="mt-4 flex flex-col border-t border-separator pt-3"
        >
          <li className="mb-1 text-caption uppercase text-label-tertiary">
            Plan my day would pin
          </li>
          {signal.suggestions.map(({ task, reason }, index) => (
            <li key={task.id} className="flex items-center gap-2">
              <span className="font-mono text-footnote tabular-nums text-label-tertiary">
                {index + 1}
              </span>
              <button
                type="button"
                onClick={() => onOpenTask(task)}
                // `py-1.5` takes the row from an 18px tap target to 32px. It
                // replaces the list's old `gap-1`, so the card is the same
                // height as before; the space is now inside the target.
                className="min-w-0 flex-1 truncate rounded-sm py-1.5 text-left text-callout text-label hover:text-blue focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40"
              >
                {task.title}
              </button>
              <span className="shrink-0 truncate text-footnote text-label-tertiary">{reason}</span>
            </li>
          ))}
        </motion.ul>
      ) : null}
    </Card>
  );
}

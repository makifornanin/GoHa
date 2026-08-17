"use client";

import { motion } from "motion/react";
import { ArrowRight, Trophy } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { listEntrance } from "@/lib/motion";
import type { ActiveGoalProgress } from "@/lib/today";

/** Active goals with their derived progress. Read-only; links to the Goals page. */
export function ActiveGoalsCard({ goals }: { goals: ActiveGoalProgress[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Goals</CardTitle>
        {/* Padded then pulled back by the same amount: a 30px tap target on a
            phone, with the header's height unchanged. */}
        <Link
          href="/goals"
          className="-my-1.5 flex items-center gap-1 rounded-sm px-1 py-1.5 text-callout font-medium text-blue hover:underline"
        >
          All
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        {goals.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Trophy className="size-7 text-label-tertiary" aria-hidden />
            <p className="text-callout text-label-secondary">No active goals right now.</p>
            <Link href="/goals" className="text-callout font-medium text-blue hover:underline">
              Set a goal
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {goals.slice(0, 5).map(({ goal, percent }, index) => (
              <motion.li
                key={goal.id}
                variants={listEntrance}
                initial="hidden"
                animate="visible"
                custom={index}
              >
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-body text-label">{goal.title}</span>
                  <span className="shrink-0 font-mono text-footnote tabular-nums text-label-secondary">
                    {percent}%
                  </span>
                </div>
                <Progress value={percent} label={`${goal.title} ${percent}% complete`} />
              </motion.li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { AnimatePresence, motion } from "motion/react";
import { ListChecks, Plus } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

import type { Task } from "@/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { listEntrance, spring } from "@/lib/motion";
import { taskPriorityConfig } from "@/lib/tasks";
import type { ResolvedPriority } from "@/lib/today";
import { cn } from "@/lib/utils";

import { TaskChecklistItem } from "./task-checklist-item";

const MAX_PRIORITIES = 3;
const PICKER_LAYOUT_ID = "priority-picker-sheet";

function PriorityChip({ task }: { task: Task }) {
  const meta = taskPriorityConfig[task.priority];
  return (
    <span className={cn("shrink-0 rounded-sm px-1.5 py-0.5 text-footnote", meta.badge)}>
      {meta.label}
    </span>
  );
}

/**
 * "Top 3 Actions": the day's daily_priorities, each REFERENCING a canonical
 * task. Toggling completes the underlying task; removing only unpins it. The
 * picker modal MORPHS open from its trigger via a shared layoutId (spec
 * section 9: morph, do not fade).
 */
export function TopPriorities({
  priorities,
  candidates,
  onToggle,
  onOpen,
  onAdd,
  onRemove,
}: {
  priorities: ResolvedPriority[];
  candidates: Task[];
  onToggle: (task: Task) => void;
  onOpen?: (task: Task) => void;
  onAdd: (taskId: string) => void;
  onRemove: (priorityId: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pinned = priorities.filter((p) => p.task);
  const canAdd = pinned.length < MAX_PRIORITIES;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top 3 Actions</CardTitle>
        <span className="font-mono text-footnote tabular-nums text-label-secondary">
          {pinned.length}
          <span className="text-label-tertiary">/{MAX_PRIORITIES}</span>
        </span>
      </CardHeader>
      <CardContent className="px-1 pb-2">
        {pinned.length === 0 ? (
          <p className="mx-3 mb-2 rounded-xl bg-surface-secondary px-4 py-6 text-center text-callout text-label-secondary">
            Pin your three most important tasks for today to stay focused.
          </p>
        ) : (
          <div className="flex flex-col">
            {pinned.map(({ priority, task }, index) =>
              task ? (
                <motion.div
                  key={priority.id}
                  variants={listEntrance}
                  initial="hidden"
                  animate="visible"
                  custom={index}
                >
                  <TaskChecklistItem
                    task={task}
                    onToggle={onToggle}
                    onOpen={onOpen}
                    meta={<PriorityChip task={task} />}
                    onRemove={() => onRemove(priority.id)}
                    removeLabel={`Unpin ${task.title}`}
                  />
                </motion.div>
              ) : null,
            )}
          </div>
        )}

        {canAdd ? (
          <AnimatePresence initial={false}>
            {!pickerOpen ? (
              <motion.button
                type="button"
                layoutId={PICKER_LAYOUT_ID}
                transition={spring.snappy}
                onClick={() => setPickerOpen(true)}
                className="mx-3 mb-2 mt-2 flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-callout font-medium text-blue transition-colors hover:bg-surface-hover focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40"
              >
                <Plus className="size-4" aria-hidden />
                Add a priority
              </motion.button>
            ) : null}
          </AnimatePresence>
        ) : null}
      </CardContent>

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Pick a priority"
        description="Choose a to-do to focus on today."
        layoutId={PICKER_LAYOUT_ID}
      >
        <div className="px-6 py-5">
          {candidates.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <ListChecks className="size-7 text-label-tertiary" aria-hidden />
              <p className="text-callout text-label-secondary">No available tasks to pin.</p>
              <Link href="/tasks" className="text-callout font-medium text-blue hover:underline">
                Create a task
              </Link>
            </div>
          ) : (
            <ul className="flex max-h-80 flex-col overflow-y-auto">
              {candidates.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onAdd(task.id);
                      setPickerOpen(false);
                    }}
                    className="flex h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-left transition-colors hover:bg-surface-hover active:bg-surface-pressed"
                  >
                    <span className="min-w-0 flex-1 truncate text-body text-label">{task.title}</span>
                    <PriorityChip task={task} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </Card>
  );
}

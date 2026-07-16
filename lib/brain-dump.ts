import type { BrainDumpConvertedType } from "@/db/schema/enums";

/** Shared, client-safe constants for Brain Dump. */

export const BRAIN_DUMP_CONTENT_MAX = 2000;

export const CONVERT_TARGETS = ["task", "goal", "habit"] as const satisfies readonly BrainDumpConvertedType[];

export const convertTargetConfig: Record<BrainDumpConvertedType, { label: string; module: string }> = {
  task: { label: "Task", module: "/tasks" },
  goal: { label: "Goal", module: "/goals" },
  habit: { label: "Habit", module: "/habits" },
};

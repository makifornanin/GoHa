"use client";

import { Check, SkipForward, X } from "lucide-react";
import { useState } from "react";

import type { HabitEntry } from "@/db";
import { toNumberOrNull } from "@/lib/habits";
import { cn } from "@/lib/utils";

export type LogHabit = {
  type: "boolean" | "numeric";
  targetValue: string | null;
  unit: string | null;
};

export type LogInput = { status: "done" | "missed" | "skipped"; value?: number | null };

/**
 * Logging interaction for one habit on one day. Boolean habits get done / skip /
 * miss (clicking the active state clears it); numeric habits get a value input
 * plus done/skip. All calls flow to the same upsert action (idempotent).
 * Controls are circular (Apple Reminders signature), 28px visual with a 44px
 * hit area, semantic colors: done green, skip gray, miss red.
 */
export function HabitLogControl({
  habit,
  entry,
  onLog,
  onClear,
  disabled,
}: {
  habit: LogHabit;
  entry: HabitEntry | null;
  onLog: (input: LogInput) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const status = entry?.status ?? null;

  if (habit.type === "numeric") {
    return (
      <NumericControl habit={habit} entry={entry} onLog={onLog} onClear={onClear} disabled={disabled} />
    );
  }

  const btn = (active: boolean, tone: "done" | "skip" | "miss") =>
    cn(
      "hit-44 hit-44-narrow flex size-7 cursor-pointer items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 disabled:cursor-not-allowed disabled:opacity-50",
      active && tone === "done" && "border-transparent bg-green text-white",
      active && tone === "skip" && "border-transparent bg-gray-3 text-label",
      active && tone === "miss" && "border-transparent bg-red text-white",
      !active && "border-gray-3 text-label-tertiary hover:border-gray-1 hover:text-label-secondary",
    );

  const toggle = (target: LogInput["status"]) => {
    if (status === target) onClear();
    else onLog({ status: target });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={disabled}
        aria-pressed={status === "done"}
        aria-label="Mark done"
        onClick={() => toggle("done")}
        className={btn(status === "done", "done")}
      >
        <Check className="size-4 stroke-2" aria-hidden />
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={status === "skipped"}
        aria-label="Skip today"
        onClick={() => toggle("skipped")}
        className={btn(status === "skipped", "skip")}
      >
        <SkipForward className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={status === "missed"}
        aria-label="Mark missed"
        onClick={() => toggle("missed")}
        className={btn(status === "missed", "miss")}
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

function NumericControl({
  habit,
  entry,
  onLog,
  onClear,
  disabled,
}: {
  habit: LogHabit;
  entry: HabitEntry | null;
  onLog: (input: LogInput) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const target = toNumberOrNull(habit.targetValue);
  const [draft, setDraft] = useState(() => {
    const current = toNumberOrNull(entry?.value ?? null);
    return current != null ? String(current) : target != null ? String(target) : "";
  });

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        aria-label="Logged value"
        className="h-7 w-16 rounded-md bg-fill-tertiary px-2 text-right font-mono text-callout tabular-nums text-label transition-colors focus-visible:bg-surface focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 disabled:opacity-50"
      />
      {target != null ? (
        <span className="whitespace-nowrap font-mono text-footnote tabular-nums text-label-secondary">
          / {target}
          {habit.unit ? ` ${habit.unit}` : ""}
        </span>
      ) : null}
      <button
        type="button"
        disabled={disabled || draft.trim() === ""}
        onClick={() => onLog({ status: "done", value: Number(draft) })}
        className="hit-44 hit-44-narrow h-7 cursor-pointer rounded-full bg-green px-2.5 text-footnote font-medium text-white transition-[filter] hover:brightness-[1.06] focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 disabled:cursor-not-allowed disabled:bg-gray-5 disabled:text-label-quaternary"
      >
        Log
      </button>
      {entry ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onClear}
          aria-label="Clear entry"
          className="hit-44 hit-44-narrow flex size-7 cursor-pointer items-center justify-center rounded-full text-label-tertiary transition-colors hover:text-label-secondary focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 disabled:opacity-50"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

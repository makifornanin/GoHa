"use client";

import { CornerDownLeft, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createTaskAction } from "@/app/(app)/tasks/actions";

/**
 * Quick-add a task scheduled for today. Creates a CANONICAL task via the same
 * Server Action the To-dos page uses, so it appears everywhere (CLAUDE.md 7).
 * A solid card (content surface, never glass) with a filled-field input.
 */
export function QuickAddTask({ today }: { today: string }) {
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const trimmed = title.trim();
    if (!trimmed || pending) return;
    startTransition(async () => {
      const result = await createTaskAction({ title: trimmed, scheduledFor: today });
      if (result.ok) {
        setTitle("");
        toast.success(`Added "${result.data.title}" to today`);
      } else {
        toast.error(result.error);
      }
    });
  }

  const canSubmit = title.trim().length > 0 && !pending;

  return (
    <div className="flex h-12 items-center gap-2 rounded-2xl border border-separator-opaque bg-surface px-3 shadow-e1 transition-colors focus-within:border-blue/40">
      <Plus className="size-4 shrink-0 text-label-tertiary" aria-hidden />
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Quick add a task for today..."
        aria-label="Quick add task for today"
        disabled={pending}
        className="min-w-0 flex-1 bg-transparent text-body text-label placeholder:text-label-tertiary focus:outline-none disabled:text-label-quaternary"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        aria-label="Save quick task"
        className="hit-44 hit-44-narrow flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-surface-secondary text-label-secondary transition-colors hover:bg-surface-pressed hover:text-label focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 disabled:cursor-not-allowed disabled:text-label-quaternary"
      >
        <CornerDownLeft className="size-4" aria-hidden />
      </button>
    </div>
  );
}

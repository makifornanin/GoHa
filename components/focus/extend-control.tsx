"use client";

import { AnimatePresence, motion } from "motion/react";
import { Plus } from "lucide-react";
import { useState } from "react";

import {
  FOCUS_EXTEND_MAX_MINUTES,
  FOCUS_EXTEND_MIN_MINUTES,
  FOCUS_EXTEND_PRESETS_MINUTES,
  parseDurationMinutes,
} from "@/lib/focus";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * "Need more time?": one-tap increments plus any custom amount, so a running
 * session is never capped to a single fixed step.
 */
export function ExtendControl({
  onExtend,
  disabled,
}: {
  onExtend: (minutes: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submitCustom() {
    const parsed = parseDurationMinutes(
      draft,
      FOCUS_EXTEND_MIN_MINUTES,
      FOCUS_EXTEND_MAX_MINUTES,
    );
    if (parsed === null) {
      setError(`${FOCUS_EXTEND_MIN_MINUTES}-${FOCUS_EXTEND_MAX_MINUTES} minutes.`);
      return;
    }
    setError(null);
    setDraft("");
    setOpen(false);
    onExtend(parsed);
  }

  const chip =
    "h-7 cursor-pointer rounded-full px-3 font-mono text-footnote tabular-nums text-blue transition-colors hover:bg-blue/12 focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 disabled:opacity-50";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-1">
        <span className="mr-1 inline-flex items-center gap-1 text-footnote text-label-secondary">
          <Plus className="size-3.5" aria-hidden />
          Need more time?
        </span>
        {FOCUS_EXTEND_PRESETS_MINUTES.map((m) => (
          <button
            key={m}
            type="button"
            disabled={disabled}
            onClick={() => onExtend(m)}
            className={chip}
          >
            {m}m
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={cn(chip, "font-sans", open && "bg-blue/12")}
        >
          Custom
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={spring.snappy}
            className="overflow-hidden"
          >
            <div className="flex flex-col items-center gap-1.5 pt-1">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  value={draft}
                  disabled={disabled}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitCustom();
                    if (e.key === "Escape") setOpen(false);
                  }}
                  placeholder="e.g. 20"
                  aria-label="Custom minutes to add"
                  aria-invalid={Boolean(error)}
                  className="h-8 w-28 rounded-lg bg-surface-secondary px-3 text-center font-mono text-callout tabular-nums text-label focus-visible:bg-surface focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40"
                />
                <button
                  type="button"
                  disabled={disabled || draft.trim() === ""}
                  onClick={submitCustom}
                  className="h-8 cursor-pointer rounded-lg bg-blue px-3 text-callout font-medium text-white transition-[filter] hover:brightness-[1.06] disabled:bg-gray-5 disabled:text-label-quaternary"
                >
                  Add
                </button>
              </div>
              {error ? (
                <p role="alert" className="text-footnote text-red">
                  {error}
                </p>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

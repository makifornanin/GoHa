"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  FOCUS_MAX_MINUTES,
  FOCUS_MIN_MINUTES,
  FOCUS_PRESETS_MINUTES,
  parseDurationMinutes,
} from "@/lib/focus";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

const CUSTOM = "custom";

/**
 * Session length: one-tap presets plus a free-form field that understands
 * "90", "1h30", "1h 30m", or "45m", so a length outside the presets is one
 * keystroke away rather than impossible.
 */
export function DurationPicker({
  minutes,
  onChange,
  disabled,
}: {
  minutes: number;
  onChange: (minutes: number) => void;
  disabled?: boolean;
}) {
  const isPreset = (FOCUS_PRESETS_MINUTES as readonly number[]).includes(minutes);
  const [mode, setMode] = useState<string>(isPreset ? String(minutes) : CUSTOM);
  const [draft, setDraft] = useState(isPreset ? "" : String(minutes));
  const [error, setError] = useState<string | null>(null);

  const options = [
    ...FOCUS_PRESETS_MINUTES.map((preset) => ({
      value: String(preset),
      label: `${preset}m`,
    })),
    { value: CUSTOM, label: "Custom" },
  ];

  function pick(value: string) {
    setMode(value);
    setError(null);
    if (value === CUSTOM) {
      const parsed = parseDurationMinutes(draft);
      if (parsed) onChange(parsed);
      return;
    }
    onChange(Number(value));
  }

  function commitCustom(value: string) {
    setDraft(value);
    if (value.trim() === "") {
      setError(null);
      return;
    }
    const parsed = parseDurationMinutes(value);
    if (parsed === null) {
      setError(`Try "90", "1h30", or "45m" (${FOCUS_MIN_MINUTES}-${FOCUS_MAX_MINUTES} min).`);
      return;
    }
    setError(null);
    onChange(parsed);
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <SegmentedControl
        value={mode}
        onChange={pick}
        options={options}
        ariaLabel="Session duration"
      />

      <AnimatePresence initial={false}>
        {mode === CUSTOM ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={spring.snappy}
            className="overflow-hidden"
          >
            <div className="flex flex-col items-center gap-1.5 pt-1">
              <input
                type="text"
                inputMode="text"
                autoFocus
                value={draft}
                disabled={disabled}
                onChange={(e) => commitCustom(e.target.value)}
                placeholder="e.g. 1h 30m"
                aria-label="Custom session length"
                aria-invalid={Boolean(error)}
                className={cn(
                  "h-8 w-40 rounded-lg bg-surface-secondary px-3 text-center font-mono text-callout tabular-nums text-label transition-colors focus-visible:bg-surface focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40",
                  error && "outline-solid outline-[3px] outline-offset-2 outline-red/40",
                )}
              />
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

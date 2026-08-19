"use client";

import { cn } from "@/lib/utils";

/**
 * An iOS-style switch.
 *
 * The knob is `left-0` deliberately. Without it the span's static position is
 * wherever the button's default centred text alignment puts it, so the
 * translate offsets measured from the left edge landed it mid-pill when off and
 * outside the pill when on. That is what made the settings toggles look like
 * plain green rectangles with no knob at all.
 *
 * `role="switch"` with `aria-checked` rather than a checkbox: it announces as
 * on or off instead of checked, which is what this control means.
 */
export function Switch({
  id,
  checked,
  onChange,
  disabled,
  label,
  className,
}: {
  id?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Used as the accessible name when no visible label points at this id. */
  label?: string;
  className?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "hit-44 relative inline-flex h-[31px] w-[51px] shrink-0 cursor-pointer rounded-full",
        "transition-colors duration-200 ease-out",
        "focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-green" : "bg-fill-secondary",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-[2px] size-[27px] rounded-full bg-white shadow-e1",
          "transition-transform duration-200 ease-out",
          checked ? "translate-x-[22px]" : "translate-x-[2px]",
        )}
      />
    </button>
  );
}

"use client";

import { motion } from "motion/react";
import { useId } from "react";
import type { KeyboardEvent } from "react";

import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = { value: T; label: string };

/**
 * Segmented control per spec section 8: height 30, radius full, track
 * surface-secondary with 2px padding, selected pill on `surface` with shadow
 * e1, animated with `layoutId` so it slides (morphs) between segments.
 * Keyboard: radiogroup with Arrow keys, Home, End.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  ariaLabel: string;
  className?: string;
}) {
  const pillId = useId();
  const selectedIndex = options.findIndex((o) => o.value === value);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let next = selectedIndex;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (selectedIndex + 1) % options.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (selectedIndex - 1 + options.length) % options.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = options.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    onChange(options[next].value);
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex h-[30px] items-center rounded-full bg-fill-tertiary p-[2px]",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative h-full cursor-pointer rounded-full px-3 text-[13px]/[18px] font-medium transition-colors duration-150 focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40",
              selected ? "text-label" : "text-label-secondary hover:text-label",
            )}
          >
            {selected ? (
              <motion.span
                layoutId={pillId}
                transition={spring.snappy}
                className="absolute inset-0 rounded-full bg-surface shadow-e1"
                aria-hidden
              />
            ) : null}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

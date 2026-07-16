"use client";

import { motion } from "motion/react";

import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Tone = "primary" | "secondary" | "success" | "warning" | "error";

const toneBar: Record<Tone, string> = {
  primary: "bg-blue",
  secondary: "bg-indigo",
  success: "bg-green",
  warning: "bg-orange",
  error: "bg-red",
};

const toneStroke: Record<Tone, string> = {
  primary: "stroke-blue",
  secondary: "stroke-indigo",
  success: "stroke-green",
  warning: "stroke-orange",
  error: "stroke-red",
};

function clamp(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Linear meter. Blue accent by default; fill animates on the smooth spring. */
export function Progress({
  value,
  tone = "primary",
  className,
  label,
}: {
  value: number;
  tone?: Tone;
  className?: string;
  label?: string;
}) {
  const pct = clamp(value);
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-1 w-full overflow-hidden rounded-full bg-gray-5", className)}
    >
      <motion.div
        className={cn("h-full rounded-full", toneBar[tone])}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={spring.smooth}
      />
    </div>
  );
}

/** Circular progress readout with a tabular Geist Mono value. */
export function ProgressRing({
  percent,
  size = 80,
  stroke = 3,
  tone = "primary",
  label,
  showValue = true,
  className,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  tone?: Tone;
  label?: string;
  showValue?: boolean;
  className?: string;
}) {
  const pct = clamp(percent);

  return (
    <div
      className={cn("relative flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg className="size-full -rotate-90" viewBox="0 0 36 36" aria-hidden>
        <path
          className="stroke-gray-5"
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          strokeWidth={stroke}
        />
        <motion.path
          className={toneStroke[tone]}
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: pct / 100 }}
          transition={spring.smooth}
        />
      </svg>
      {showValue ? (
        <span className="absolute font-mono text-[17px]/[22px] font-medium tabular-nums text-label">
          {pct}
          <span className="text-footnote text-label-secondary">%</span>
        </span>
      ) : null}
      {label ? <span className="sr-only">{label}</span> : null}
    </div>
  );
}

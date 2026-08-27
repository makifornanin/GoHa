import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** Filled-field textarea matching the Input treatment (spec section 8). */
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // 16px on mobile for the same reason as Input: iOS Safari zooms the
        // page when a focused field's text is under 16px, and Brain Dump and
        // the review notes are mostly typed on a phone.
        "flex min-h-20 w-full rounded-lg bg-fill-tertiary px-3 py-2.5 text-[16px] text-label sm:px-2.5 sm:py-2 sm:text-body transition-colors duration-150 placeholder:text-label-secondary focus-visible:bg-surface focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 disabled:cursor-not-allowed disabled:text-label-quaternary",
        className,
      )}
      {...props}
    />
  );
}

import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Input per spec section 8: height 32, padding-x 10, radius 10, filled-field
 * style (surface-secondary, no border at rest). Focus: 3px blue ring at 40%
 * and the background lifts to surface.
 */
export function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-8 w-full rounded-lg bg-surface-secondary px-2.5 text-body text-label transition-colors duration-150 placeholder:text-label-tertiary focus-visible:bg-surface focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 disabled:cursor-not-allowed disabled:text-label-quaternary",
        className,
      )}
      {...props}
    />
  );
}

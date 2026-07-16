import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Styled native select (native for built-in accessibility and mobile UX),
 * matching the filled-field Input treatment: height 32, padding-x 10,
 * radius 10, surface-secondary at rest, 3px blue focus ring.
 */
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        className={cn(
          "h-8 w-full cursor-pointer appearance-none rounded-lg bg-surface-secondary pl-2.5 pr-8 text-body text-label transition-colors duration-150 focus-visible:bg-surface focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 disabled:cursor-not-allowed disabled:text-label-quaternary",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-label-secondary"
        aria-hidden
      />
    </div>
  );
}

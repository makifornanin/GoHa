import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** Filled-field textarea matching the Input treatment (spec section 8). */
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full rounded-lg bg-fill-tertiary px-2.5 py-2 text-body text-label transition-colors duration-150 placeholder:text-label-tertiary focus-visible:bg-surface focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 disabled:cursor-not-allowed disabled:text-label-quaternary",
        className,
      )}
      {...props}
    />
  );
}

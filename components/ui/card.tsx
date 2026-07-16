import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Card per spec section 8: radius 16, padding 16, `surface` background,
 * 1px `separator-opaque` border, shadow e1. Cards are ALWAYS solid, never
 * glass (spec section 5). Per the concentric rule (section 6), nested
 * rounded children inside the 16px padding use radius 4 (`rounded-xs`)
 * unless they are inset less (rows inset 4px use radius 12).
 */
const cardVariants = cva("rounded-2xl", {
  variants: {
    tone: {
      default: "border border-separator-opaque bg-surface shadow-e1",
      raised: "border border-separator-opaque bg-surface shadow-e1",
      ghost: "bg-surface-secondary",
    },
    interactive: {
      true: "cursor-pointer transition-shadow duration-150 hover:shadow-e2",
      false: "",
    },
  },
  defaultVariants: { tone: "default", interactive: false },
});

export function Card({
  className,
  tone,
  interactive,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return (
    <div
      data-slot="card"
      className={cn(cardVariants({ tone, interactive }), className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex items-center justify-between gap-3 px-4 pt-4", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      className={cn("text-headline text-label", className)}
      {...props}
    />
  );
}

/** Card title to content gap: 12 (proximity law). */
export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-4 pb-4 pt-3", className)}
      {...props}
    />
  );
}

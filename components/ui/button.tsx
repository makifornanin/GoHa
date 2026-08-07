import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Button per spec section 8. Sizes: sm 28/10/8, md 32/14/10, lg 40/18/12.
 * States: hover lighten 6%, active scale(0.96) + opacity(0.8), focus-visible
 * 3px blue ring at 40% with 2px offset, disabled label-quaternary, loading
 * spinner with stable width.
 *
 * The disabled palette is applied in JS (not `disabled:` variants) so a
 * LOADING button keeps its variant colors: the disabled attribute is set while
 * loading to block interaction, but graying the primary action mid-submit
 * would read as broken feedback.
 */
const buttonVariants = cva(
  "inline-flex cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,color,opacity,transform,filter] duration-150 focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 active:scale-[0.96] active:opacity-80 disabled:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-blue text-white hover:brightness-[1.06]",
        secondary: "bg-fill-tertiary text-label hover:bg-fill-secondary",
        outline:
          "border border-separator-opaque bg-transparent text-label-secondary hover:bg-surface-hover hover:text-label",
        ghost: "bg-transparent text-blue hover:bg-surface-hover",
        destructive: "bg-red text-white hover:brightness-[1.06]",
        link: "text-blue underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-7 rounded-md px-2.5 text-[13px]/[18px]",
        default: "h-8 rounded-lg px-3.5 text-[14px]/[20px]",
        lg: "h-10 rounded-xl px-4.5 text-[15px]/[20px]",
        icon: "hit-44 size-9 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

/** Truly-disabled visuals (spec: label-quaternary). Not applied while loading. */
const disabledPalette: Record<
  NonNullable<VariantProps<typeof buttonVariants>["variant"]>,
  string
> = {
  default: "bg-gray-5 text-label-quaternary",
  secondary: "bg-gray-5 text-label-quaternary",
  outline: "text-label-quaternary",
  ghost: "text-label-quaternary",
  destructive: "bg-gray-5 text-label-quaternary",
  link: "text-label-quaternary",
};

function Button({
  className,
  variant,
  size,
  loading = false,
  disabled,
  children,
  ...props
}: ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { loading?: boolean }) {
  return (
    <button
      data-slot="button"
      aria-busy={loading || undefined}
      disabled={loading || disabled}
      className={cn(
        "relative",
        buttonVariants({ variant, size }),
        disabled && !loading && disabledPalette[variant ?? "default"],
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="absolute inset-0 m-auto size-4 animate-spin" aria-hidden />
      ) : null}
      <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>
        {children}
      </span>
    </button>
  );
}

export { Button, buttonVariants };

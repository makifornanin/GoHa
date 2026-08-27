import type { ComponentProps, Ref } from "react";

import { cn } from "@/lib/utils";

/**
 * Input per spec section 8: height 32, padding-x 10, radius 10, filled-field
 * style (a translucent fill, no border at rest). Focus: 3px blue ring at 40%
 * and the background lifts to surface.
 *
 * Date and time inputs get extra treatment. A bare `type="date"` renders the
 * browser's own control: a different font, its own baseline, and a small grey
 * calendar glyph that reads as an unstyled form rather than part of this app.
 * The classes below give the segments the app's own type and colour, tidy the
 * picker button into something that looks deliberate, and stop the field
 * collapsing to the browser's idea of an intrinsic width.
 */
const DATE_LIKE =
  "[&::-webkit-datetime-edit]:text-label " +
  "[&::-webkit-datetime-edit-fields-wrapper]:p-0 " +
  "[&::-webkit-datetime-edit-text]:px-0.5 [&::-webkit-datetime-edit-text]:text-label-tertiary " +
  "[&::-webkit-datetime-edit-month-field]:rounded-sm [&::-webkit-datetime-edit-day-field]:rounded-sm " +
  "[&::-webkit-datetime-edit-year-field]:rounded-sm [&::-webkit-datetime-edit-hour-field]:rounded-sm " +
  "[&::-webkit-datetime-edit-minute-field]:rounded-sm [&::-webkit-datetime-edit-ampm-field]:rounded-sm " +
  // The highlighted segment should match the app's selection colour, not the
  // platform's default blue block.
  "[&::-webkit-datetime-edit-month-field:focus]:bg-blue-fill [&::-webkit-datetime-edit-month-field:focus]:text-white " +
  "[&::-webkit-datetime-edit-day-field:focus]:bg-blue-fill [&::-webkit-datetime-edit-day-field:focus]:text-white " +
  "[&::-webkit-datetime-edit-year-field:focus]:bg-blue-fill [&::-webkit-datetime-edit-year-field:focus]:text-white " +
  "[&::-webkit-datetime-edit-hour-field:focus]:bg-blue-fill [&::-webkit-datetime-edit-hour-field:focus]:text-white " +
  "[&::-webkit-datetime-edit-minute-field:focus]:bg-blue-fill [&::-webkit-datetime-edit-minute-field:focus]:text-white " +
  "[&::-webkit-datetime-edit-ampm-field:focus]:bg-blue-fill [&::-webkit-datetime-edit-ampm-field:focus]:text-white " +
  "[&::-webkit-calendar-picker-indicator]:cursor-pointer " +
  "[&::-webkit-calendar-picker-indicator]:rounded [&::-webkit-calendar-picker-indicator]:p-0.5 " +
  "[&::-webkit-calendar-picker-indicator]:opacity-45 " +
  "[&::-webkit-calendar-picker-indicator]:transition-opacity " +
  "[&::-webkit-calendar-picker-indicator]:hover:opacity-100 " +
  "dark:[&::-webkit-calendar-picker-indicator]:invert";
export function Input({
  className,
  type,
  ref,
  ...props
}: ComponentProps<"input"> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        /*
         * Two sizes, like Button and Select.
         *
         * 32px is the documented desktop density (spec section 8) but is under
         * the 44px tap target section 7 mandates, so the phone gets its own
         * height.
         *
         * The 16px font on mobile is not a style choice: iOS Safari ZOOMS the
         * whole page when a focused input's text is smaller than 16px, and
         * `--text-body` is 14px. Every field in GoHa was jumping the viewport
         * on tap. `sm:text-body` restores the intended 14px on desktop, where
         * no such behaviour exists.
         */
        "flex h-11 w-full rounded-lg bg-fill-tertiary px-3 text-[16px] text-label transition-colors duration-150 placeholder:text-label-secondary focus-visible:bg-surface focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 disabled:cursor-not-allowed disabled:text-label-quaternary sm:h-8 sm:px-2.5 sm:text-body",
        // Native date and time controls need the extra work; nothing else does.
        (type === "date" || type === "datetime-local" || type === "time") && DATE_LIKE,
        className,
      )}
      {...props}
    />
  );
}

"use client";

import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  addDays,
  formatIsoDateMedium,
  startOfMonth,
  startOfWeek,
  zonedToday,
  type IsoDate,
  type Weekday,
} from "@/lib/date";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/utils";

/**
 * Picking a planning date.
 *
 * Replaces the native `<input type="date">`. That control looked like raw HTML
 * against everything else in GoHa, rendered a different widget in every browser,
 * and made the common answers ("today", "tomorrow") take a trip through a
 * calendar. Here the common answers are one tap and the calendar is still there
 * for everything else.
 *
 * Dates are plain "YYYY-MM-DD" strings throughout, never `Date` objects. A
 * `Date` would carry a time and a zone, and the moment one is formatted or
 * parsed in the browser's zone rather than the user's, the day silently shifts.
 * `today` is passed in already resolved from the saved timezone for the same
 * reason.
 */

export type DateFieldProps = {
  id?: string;
  value: IsoDate | "";
  onChange: (next: IsoDate | "") => void;
  /** The user's local date, resolved from their saved timezone by the caller. */
  today?: IsoDate;
  /** The user's saved preference, so "this week" means their week. */
  weekStartsOn?: Weekday;
  /** Shown when nothing is chosen. */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  /**
   * Presets to offer. Tasks want the next few days; something with a real span
   * wants the week. Kept short on purpose: a long preset menu is slower to read
   * than the calendar it replaces.
   */
  presets?: "day" | "week";
};

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** A short, human label: "Today", "Tomorrow", otherwise a real date. */
export function describeDate(value: IsoDate, today: IsoDate): string {
  if (value === today) return "Today";
  if (value === addDays(today, 1)) return "Tomorrow";
  if (value === addDays(today, -1)) return "Yesterday";
  return formatIsoDateMedium(value) ?? value;
}

/** The days to draw for the month containing `anchor`, padded to whole weeks. */
function monthGrid(anchor: IsoDate, weekStartsOn: Weekday): IsoDate[] {
  const first = startOfMonth(anchor);
  const gridStart = startOfWeek(first, weekStartsOn);
  // Six rows always. A month that needs five would otherwise resize the popover
  // as you page through the year, which moves the buttons under the pointer.
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

function shiftMonth(anchor: IsoDate, months: number): IsoDate {
  const [y, m] = anchor.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function monthLabel(anchor: IsoDate): string {
  const [y, m] = anchor.split("-").map(Number);
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${names[m - 1]} ${y}`;
}

export function DateField({
  id,
  value,
  onChange,
  today: todayProp,
  weekStartsOn = 1,
  placeholder = "Pick a date",
  disabled,
  className,
  ariaLabel,
  ariaDescribedBy,
  presets = "day",
}: DateFieldProps) {
  const mounted = useMounted();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Falls back to the browser's date only when the caller gave none. Callers
  // that care about correctness pass the timezone-resolved one.
  const today = todayProp ?? zonedToday();
  const [anchor, setAnchor] = useState<IsoDate>(() => startOfMonth(value || today));
  const [focusedDay, setFocusedDay] = useState<IsoDate>(() => value || today);

  /*
   * Opening resets the calendar to the chosen date, done here rather than in an
   * effect: syncing state to props in an effect renders once with the stale
   * month and then again with the right one, which shows as a visible flash of
   * the wrong page of the calendar.
   */
  function openPicker() {
    if (disabled) return;
    const start = value || today;
    setAnchor(startOfMonth(start));
    setFocusedDay(start);
    setOpen(true);
  }

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const estimated = 380;
    const below = window.innerHeight - r.bottom;
    const top = below < estimated + 8 && r.top > below ? Math.max(8, r.top - estimated - 6) : r.bottom + 6;
    // Never let the popover hang off the right edge on a narrow screen.
    const width = Math.max(r.width, 300);
    const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - width - 8));
    setRect({ left, top, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onScroll = () => place();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const days = useMemo(() => monthGrid(anchor, weekStartsOn), [anchor, weekStartsOn]);
  const weekdayHeadings = useMemo(
    () => Array.from({ length: 7 }, (_, i) => WEEKDAY_LABELS[(weekStartsOn + i) % 7]),
    [weekStartsOn],
  );

  function commit(next: IsoDate | "") {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  }

  const quickOptions: { label: string; date: IsoDate }[] =
    presets === "week"
      ? [
          { label: "Today", date: today },
          { label: "This week", date: startOfWeek(today, weekStartsOn) },
        ]
      : [
          { label: "Today", date: today },
          { label: "Tomorrow", date: addDays(today, 1) },
        ];

  function onGridKeyDown(event: React.KeyboardEvent) {
    const moves: Record<string, number> = {
      ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7,
    };
    if (event.key in moves) {
      event.preventDefault();
      const next = addDays(focusedDay, moves[event.key]);
      setFocusedDay(next);
      setAnchor(startOfMonth(next));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commit(focusedDay);
    }
  }

  const label = value ? describeDate(value, today) : placeholder;

  const popover =
    open && rect ? (
      <div
        ref={popoverRef}
        role="dialog"
        aria-label="Choose a date"
        style={{ position: "fixed", left: rect.left, top: rect.top, width: rect.width }}
        className="glass-thick z-[70] rounded-2xl p-3 shadow-e3"
      >
        <div className="mb-2 flex flex-wrap gap-1.5">
          {quickOptions.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => commit(option.date)}
              className={cn(
                "rounded-full px-3 py-1.5 text-footnote font-medium transition-colors",
                value === option.date
                  ? "bg-blue text-white"
                  : "bg-fill-tertiary text-label-secondary hover:bg-fill-secondary hover:text-label",
              )}
            >
              {option.label}
            </button>
          ))}
          {value ? (
            <button
              type="button"
              onClick={() => commit("")}
              className="ml-auto flex items-center gap-1 rounded-full px-2.5 py-1.5 text-footnote text-label-tertiary transition-colors hover:text-red"
            >
              <X className="size-3.5" aria-hidden />
              Clear
            </button>
          ) : null}
        </div>

        <div className="mb-1 flex items-center justify-between">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setAnchor(shiftMonth(anchor, -1))}
            className="hit-44 flex size-8 items-center justify-center rounded-full text-label-secondary transition-colors hover:bg-surface-hover hover:text-label"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <span aria-live="polite" className="text-subhead font-medium text-label">
            {monthLabel(anchor)}
          </span>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setAnchor(shiftMonth(anchor, 1))}
            className="hit-44 flex size-8 items-center justify-center rounded-full text-label-secondary transition-colors hover:bg-surface-hover hover:text-label"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-0.5" aria-hidden>
          {weekdayHeadings.map((d) => (
            <div key={d} className="py-1 text-center text-caption text-label-tertiary">
              {d}
            </div>
          ))}
        </div>

        {/* One roving tabstop for the whole grid: 42 tabbable buttons would make
            keyboard users tab through six weeks to leave the field. */}
        <div
          role="grid"
          tabIndex={0}
          onKeyDown={onGridKeyDown}
          className="grid grid-cols-7 gap-0.5 rounded-lg outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue/40"
        >
          {days.map((day) => {
            const outside = day.slice(0, 7) !== anchor.slice(0, 7);
            const selected = day === value;
            const isToday = day === today;
            return (
              <button
                key={day}
                type="button"
                role="gridcell"
                tabIndex={-1}
                aria-selected={selected}
                aria-current={isToday ? "date" : undefined}
                onClick={() => commit(day)}
                className={cn(
                  "relative flex h-9 items-center justify-center rounded-lg text-callout transition-colors",
                  outside ? "text-label-quaternary" : "text-label",
                  selected
                    ? "bg-blue font-semibold text-white"
                    : day === focusedDay
                      ? "bg-fill-tertiary"
                      : "hover:bg-surface-hover",
                  isToday && !selected && "font-semibold text-blue",
                )}
              >
                {Number(day.slice(8, 10))}
              </button>
            );
          })}
        </div>
      </div>
    ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPicker())}
        className={cn(
          // Same metrics as Select and Input, including the 44px phone target.
          "flex h-11 w-full cursor-pointer items-center gap-2 rounded-lg bg-fill-tertiary px-3 text-left text-[16px] text-label transition-colors duration-150 hover:bg-fill-secondary focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 disabled:cursor-not-allowed disabled:text-label-quaternary sm:h-8 sm:px-2.5 sm:text-body",
          className,
        )}
      >
        <CalendarDays className="size-4 shrink-0 text-label-secondary" aria-hidden />
        <span className={cn("min-w-0 flex-1 truncate", !value && "text-label-tertiary")}>
          {label}
        </span>
      </button>
      {mounted ? createPortal(popover, document.body) : null}
    </>
  );
}

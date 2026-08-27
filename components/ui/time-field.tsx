"use client";

import { Clock, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { formatClockLabel } from "@/lib/date";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/utils";

/**
 * Picking a time of day.
 *
 * Replaces the native `<input type="time">`, which rendered the browser's own
 * spinner: a stack of unstyled blue blocks that ignored every token in GoHa and
 * looked different in every browser. This is the same shape as `DateField` so
 * the two controls in a form read as a pair.
 *
 * The value is always 24-hour "HH:MM", which is what the database stores and
 * what the automation schedule reads. Twelve-hour text with an AM/PM column is
 * only how it is presented, because that is how people say times.
 */

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
/** Five-minute steps. Finer than that is precision nobody schedules a brief to. */
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

type Parts = { hour12: number; minute: number; meridiem: "AM" | "PM" };

function toParts(value: string): Parts | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  if (hour24 > 23 || minute > 59) return null;
  return {
    hour12: hour24 % 12 === 0 ? 12 : hour24 % 12,
    minute,
    meridiem: hour24 < 12 ? "AM" : "PM",
  };
}

function toValue({ hour12, minute, meridiem }: Parts): string {
  const hour24 = meridiem === "AM" ? (hour12 === 12 ? 0 : hour12) : hour12 === 12 ? 12 : hour12 + 12;
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** A sensible starting point when nothing is set yet. */
const DEFAULT_PARTS: Parts = { hour12: 7, minute: 0, meridiem: "AM" };

export function TimeField({
  id,
  value,
  onChange,
  placeholder = "No time set",
  disabled,
  className,
  ariaLabel,
}: {
  id?: string;
  /** 24-hour "HH:MM", or "" for unset. */
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const mounted = useMounted();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const parts = toParts(value) ?? DEFAULT_PARTS;

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const estimated = 300;
    const below = window.innerHeight - r.bottom;
    const top =
      below < estimated + 8 && r.top > below ? Math.max(8, r.top - estimated - 6) : r.bottom + 6;
    const width = Math.max(r.width, 260);
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
        // Claimed, so an outer sheet does not also close on the same keypress.
        event.preventDefault();
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

  function set(next: Partial<Parts>) {
    onChange(toValue({ ...parts, ...next }));
  }

  const label = value ? (formatClockLabel(value) ?? placeholder) : placeholder;

  const column = (
    heading: string,
    items: (string | number)[],
    isActive: (item: string | number) => boolean,
    pick: (item: string | number) => void,
    format: (item: string | number) => string,
  ) => (
    <div className="flex min-w-0 flex-1 flex-col">
      <p className="px-1 pb-1 text-center text-caption font-medium uppercase tracking-wide text-label-tertiary">
        {heading}
      </p>
      {/* Each column scrolls on its own, so the popover stays one size no
          matter which part you are choosing. */}
      <div className="max-h-44 overflow-y-auto overscroll-contain rounded-lg bg-fill-quaternary p-1">
        {items.map((item) => {
          const active = isActive(item);
          return (
            <button
              key={String(item)}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => pick(item)}
              className={cn(
                "mb-0.5 flex h-9 w-full items-center justify-center rounded-md text-callout tabular-nums transition-colors last:mb-0",
                active
                  ? "bg-blue font-semibold text-white"
                  : "text-label-secondary hover:bg-surface-hover hover:text-label",
              )}
            >
              {format(item)}
            </button>
          );
        })}
      </div>
    </div>
  );

  const popover =
    open && rect ? (
      <div
        ref={popoverRef}
        role="dialog"
        aria-label="Choose a time"
        style={{ position: "fixed", left: rect.left, top: rect.top, width: rect.width }}
        className="glass-thick z-[70] rounded-2xl p-3 shadow-e3"
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-subhead font-medium text-label">{label}</span>
          {value ? (
            <button
              type="button"
              onClick={() => {
                // Empty is meaningful here: it turns that scheduled message off.
                onChange("");
                setOpen(false);
                triggerRef.current?.focus();
              }}
              className="flex items-center gap-1 rounded-full px-2 py-1 text-footnote text-label-tertiary transition-colors hover:text-red"
            >
              <X className="size-3.5" aria-hidden />
              Clear
            </button>
          ) : null}
        </div>

        <div role="listbox" aria-label="Time" className="flex gap-2">
          {column(
            "Hour",
            HOURS,
            (h) => h === parts.hour12,
            (h) => set({ hour12: Number(h) }),
            (h) => String(h),
          )}
          {column(
            "Min",
            MINUTES,
            (m) => m === parts.minute,
            (m) => set({ minute: Number(m) }),
            (m) => String(m).padStart(2, "0"),
          )}
          {column(
            "",
            ["AM", "PM"],
            (p) => p === parts.meridiem,
            (p) => set({ meridiem: p as "AM" | "PM" }),
            (p) => String(p),
          )}
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
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={cn(
          // Same metrics as Input, Select and DateField, 44px target included.
          "flex h-11 w-full cursor-pointer items-center gap-2 rounded-lg bg-fill-tertiary px-3 text-left text-[16px] text-label transition-colors duration-150 hover:bg-fill-secondary focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 disabled:cursor-not-allowed disabled:text-label-quaternary sm:h-8 sm:px-2.5 sm:text-body",
          className,
        )}
      >
        <Clock className="size-4 shrink-0 text-label-secondary" aria-hidden />
        <span className={cn("min-w-0 flex-1 truncate", !value && "text-label-tertiary")}>
          {label}
        </span>
      </button>
      {mounted ? createPortal(popover, document.body) : null}
    </>
  );
}

"use client";

import { Clock, X } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A time of day, typed in place.
 *
 * Shaped like the native `<input type="time">` it replaces, because that shape
 * was right: segments you type straight into, no popover to open for a value
 * you already know. What was wrong was the rendering, which was the browser's
 * own spinner and ignored every token in GoHa.
 *
 * The segments are UNCONTROLLED, which is the load-bearing detail. Driving them
 * from React state meant every keystroke rewrote the DOM value, and the save
 * that followed refreshed the server tree and reset the field mid-word: typing
 * 45 measured as 8:04 in a real browser, at both sizes, twice. Letting the
 * browser own the text while it is being typed is exactly what the native
 * element did, and it is why this behaves.
 *
 * The value in and out is always 24-hour "HH:MM", which is what the column
 * stores and what the automation schedule reads. Twelve-hour segments are
 * presentation only.
 */

type Meridiem = "AM" | "PM";

function parse(value: string): { hour: string; minute: string; meridiem: Meridiem } {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return { hour: "", minute: "", meridiem: "AM" };
  const hour24 = Number(match[1]);
  if (hour24 > 23) return { hour: "", minute: "", meridiem: "AM" };
  return {
    hour: String(hour24 % 12 === 0 ? 12 : hour24 % 12),
    minute: match[2],
    meridiem: hour24 < 12 ? "AM" : "PM",
  };
}

/** 12 AM is midnight and 12 PM is noon: the conversion written backwards most. */
function serialize(hour: number, minute: number, meridiem: Meridiem): string {
  const hour24 = meridiem === "AM" ? (hour === 12 ? 0 : hour) : hour === 12 ? 12 : hour + 12;
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const SEGMENT =
  "w-[2.5ch] bg-transparent text-center tabular-nums text-label outline-none placeholder:text-label-tertiary focus:rounded focus:bg-blue focus:text-white";

export function TimeField({
  id,
  value,
  onChange,
  disabled,
  className,
  ariaLabel,
}: {
  id?: string;
  /** 24-hour "HH:MM", or "" for unset. */
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const initial = parse(value);
  const hourRef = useRef<HTMLInputElement>(null);
  const minuteRef = useRef<HTMLInputElement>(null);
  const [meridiem, setMeridiem] = useState<Meridiem>(initial.meridiem);
  // Only decides whether the clear button is offered. The text itself belongs
  // to the browser until the field is left.
  const [filled, setFilled] = useState(Boolean(initial.hour && initial.minute));

  /*
   * Whether the next digit starts a new value rather than extending one.
   *
   * Native time segments behave this way: arrive at a segment and the first
   * number you press replaces what was there, the second appends. Reproducing
   * it with selection alone did not survive a click, because the browser sets
   * the caret AFTER the click handler runs, leaving a full two-character
   * segment with nothing selected and `maxLength` silently rejecting every
   * keystroke. Measured: clicking a minute reading 40 and typing 15 left 40.
   *
   * So digits are handled directly instead, and this flag is the whole rule.
   */
  const fresh = useRef(true);

  function digitsOf(el: HTMLInputElement | null): string {
    return (el?.value ?? "").replace(/\D/g, "").slice(0, 2);
  }

  /** Type a digit into a segment the way the native control does. */
  function typeDigit(el: HTMLInputElement, key: string, isHour: boolean) {
    el.value = fresh.current ? key : (el.value + key).slice(-2);
    fresh.current = false;
    if (isHour && (el.value.length === 2 || Number(el.value) > 1)) {
      fresh.current = true;
      minuteRef.current?.focus();
    }
  }

  /**
   * Tidy both segments and report the result. Runs when the field is left.
   *
   * Blur is when a half-typed value stops being half-typed, so it is the honest
   * moment to clamp 99 to 12 and pad 5 to 05, rather than correcting someone
   * between two keystrokes.
   */
  function normalize(nextMeridiem: Meridiem = meridiem) {
    const rawHour = digitsOf(hourRef.current);
    const rawMinute = digitsOf(minuteRef.current);

    if (!rawHour && !rawMinute) {
      if (hourRef.current) hourRef.current.value = "";
      if (minuteRef.current) minuteRef.current.value = "";
      setFilled(false);
      // Empty is a real setting: it turns that scheduled message off.
      onChange("");
      return;
    }
    // A half-filled field is not a time. Left as typed, and nothing is saved.
    if (!rawHour || !rawMinute) {
      setFilled(false);
      return;
    }

    const hour = Math.min(12, Math.max(1, Number(rawHour)));
    const minute = Math.min(59, Number(rawMinute));
    if (hourRef.current) hourRef.current.value = String(hour);
    if (minuteRef.current) minuteRef.current.value = String(minute).padStart(2, "0");
    setFilled(true);
    onChange(serialize(hour, minute, nextMeridiem));
  }

  /** Arrow keys step a segment, the way the native control did. */
  function step(kind: "hour" | "minute", direction: 1 | -1) {
    if (kind === "hour") {
      const current = Number(digitsOf(hourRef.current)) || 12;
      if (hourRef.current) hourRef.current.value = String(((current - 1 + direction + 12) % 12) + 1);
    } else {
      const current = Number(digitsOf(minuteRef.current)) || 0;
      if (minuteRef.current)
        minuteRef.current.value = String((current + direction + 60) % 60).padStart(2, "0");
    }
    normalize();
  }

  function toggleMeridiem() {
    const next: Meridiem = meridiem === "AM" ? "PM" : "AM";
    setMeridiem(next);
    // Passed explicitly: the state update has not flushed yet, and reading the
    // stale value here is how a toggle saves the meridiem it just left.
    normalize(next);
  }

  function clear() {
    if (hourRef.current) hourRef.current.value = "";
    if (minuteRef.current) minuteRef.current.value = "";
    setMeridiem("AM");
    setFilled(false);
    onChange("");
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      // One blur for the whole field. Moving from hour to minute is not
      // leaving, and treating it as such would fire the save that refreshes the
      // page halfway through typing.
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        normalize();
      }}
      className={cn(
        "flex h-11 w-full items-center gap-1 rounded-lg bg-fill-tertiary px-3 text-[16px] transition-colors sm:h-8 sm:px-2.5 sm:text-body",
        "focus-within:bg-surface focus-within:outline-solid focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-blue/40",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <Clock className="size-4 shrink-0 text-label-secondary" aria-hidden />

      <input
        id={id}
        ref={hourRef}
        type="text"
        inputMode="numeric"
        maxLength={2}
        aria-label={`${ariaLabel ?? "Time"} hour`}
        defaultValue={initial.hour}
        placeholder="--"
        disabled={disabled}
        onFocus={() => {
          fresh.current = true;
        }}
        onPointerDown={() => {
          fresh.current = true;
        }}
        onKeyDown={(e) => {
          if (/^\d$/.test(e.key)) {
            e.preventDefault();
            typeDigit(e.currentTarget, e.key, true);
            return;
          }
          // Any other single character is not part of a time. Blocked here
          // because the input is uncontrolled, so nothing else would remove it.
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            return;
          }
          if (e.key === "Backspace") {
            e.preventDefault();
            e.currentTarget.value = "";
            fresh.current = true;
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            step("hour", 1);
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            step("hour", -1);
          }
        }}
        className={cn(SEGMENT, "text-right")}
      />
      <span aria-hidden className="text-label-secondary">
        :
      </span>
      <input
        ref={minuteRef}
        type="text"
        inputMode="numeric"
        maxLength={2}
        aria-label={`${ariaLabel ?? "Time"} minute`}
        defaultValue={initial.minute}
        placeholder="--"
        disabled={disabled}
        onFocus={() => {
          fresh.current = true;
        }}
        onPointerDown={() => {
          fresh.current = true;
        }}
        onKeyDown={(e) => {
          if (/^\d$/.test(e.key)) {
            e.preventDefault();
            typeDigit(e.currentTarget, e.key, false);
            return;
          }
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            return;
          }
          if (e.key === "Backspace") {
            e.preventDefault();
            // An empty minute walks back to the hour, like the native control.
            if (!e.currentTarget.value) {
              fresh.current = true;
              hourRef.current?.focus();
            } else {
              e.currentTarget.value = "";
              fresh.current = true;
            }
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            step("minute", 1);
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            step("minute", -1);
          }
        }}
        className={SEGMENT}
      />

      <button
        type="button"
        onClick={toggleMeridiem}
        disabled={disabled}
        aria-label={`${ariaLabel ?? "Time"} meridiem, currently ${meridiem}`}
        className="ml-0.5 rounded px-1.5 py-0.5 text-label transition-colors hover:bg-surface-hover focus-visible:bg-blue focus-visible:text-white focus-visible:outline-none"
      >
        {meridiem}
      </button>

      {filled ? (
        <button
          type="button"
          onClick={clear}
          disabled={disabled}
          aria-label={`Clear ${ariaLabel ?? "time"}`}
          className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-full text-label-tertiary transition-colors hover:bg-surface-hover hover:text-red focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue/40"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronsUpDown } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { popIn } from "@/lib/motion";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string; disabled?: boolean };

/**
 * Custom select. The native `<select>` renders the operating system's own
 * dropdown, which ignores the design system entirely; this replaces it with a
 * styled popover while keeping full keyboard support (Arrows, Home/End, Enter,
 * Escape, type-ahead) and the listbox ARIA contract.
 *
 * The popover is PORTALED to <body> and positioned with `fixed` coordinates:
 * these selects live inside modals whose content scrolls (`overflow-y-auto`),
 * and an absolutely positioned menu would be clipped by that container.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = "Select...",
  disabled,
  id,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ buffer: "", timer: null as ReturnType<typeof setTimeout> | null });
  const listboxId = useId();
  const mounted = useMounted();

  const selected = options.find((o) => o.value === value) ?? null;
  const selectable = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Flip above when there is not enough room below.
    const below = window.innerHeight - r.bottom;
    const estimated = Math.min(options.length * 32 + 16, 288);
    const top = below < estimated + 8 && r.top > below ? r.top - estimated - 6 : r.bottom + 6;
    setRect({ left: r.left, top, width: r.width });
  }, [options.length]);

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
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function openMenu() {
    if (disabled) return;
    const current = options.findIndex((o) => o.value === value);
    setActiveIndex(current >= 0 ? current : (selectable[0] ?? -1));
    setOpen(true);
  }

  function commit(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function move(direction: 1 | -1) {
    if (selectable.length === 0) return;
    const pos = selectable.indexOf(activeIndex);
    const next =
      pos < 0
        ? direction === 1
          ? selectable[0]
          : selectable[selectable.length - 1]
        : selectable[(pos + direction + selectable.length) % selectable.length];
    setActiveIndex(next);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(selectable[0]);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(selectable[selectable.length - 1]);
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case "Tab":
        setOpen(false);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        commit(activeIndex);
        break;
      default: {
        if (event.key.length !== 1 || event.metaKey || event.ctrlKey) return;
        const state = typeahead.current;
        if (state.timer) clearTimeout(state.timer);
        state.buffer += event.key.toLowerCase();
        state.timer = setTimeout(() => (state.buffer = ""), 500);
        const match = selectable.find((i) =>
          options[i].label.toLowerCase().startsWith(state.buffer),
        );
        if (match != null) setActiveIndex(match);
      }
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={cn(
          "flex h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-lg bg-fill-tertiary pl-3 pr-2.5 text-left text-body text-label sm:h-8 sm:pl-2.5 sm:pr-2 transition-colors duration-150 hover:bg-fill-secondary focus-visible:bg-surface focus-visible:outline-solid focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-blue/40 disabled:cursor-not-allowed disabled:text-label-quaternary",
          className,
        )}
      >
        <span className={cn("min-w-0 truncate", !selected && "text-label-tertiary")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-label-secondary" aria-hidden />
      </button>

      {mounted && open && rect
        ? createPortal(
            <AnimatePresence>
              <motion.div
                ref={listRef}
                role="listbox"
                id={listboxId}
                aria-activedescendant={
                  activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined
                }
                tabIndex={-1}
                variants={popIn}
                initial="hidden"
                animate="visible"
                exit="exit"
                onKeyDown={onKeyDown}
                style={{
                  position: "fixed",
                  left: rect.left,
                  top: rect.top,
                  width: rect.width,
                  transformOrigin: "top center",
                }}
                className="glass-regular z-[60] max-h-72 overflow-y-auto rounded-xl p-1 shadow-e3"
              >
                {options.map((option, index) => {
                  const isSelected = option.value === value;
                  const isActive = index === activeIndex;
                  return (
                    <button
                      key={option.value}
                      id={`${listboxId}-${index}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={option.disabled}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => commit(index)}
                      className={cn(
                        "flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-callout outline-none transition-colors",
                        isActive ? "bg-blue-fill text-white" : "text-label",
                        option.disabled && "pointer-events-none text-label-quaternary",
                      )}
                    >
                      <Check
                        className={cn("size-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    </button>
                  );
                })}
              </motion.div>
            </AnimatePresence>,
            document.body,
          )
        : null}
    </>
  );
}

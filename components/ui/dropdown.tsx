"use client";

import { AnimatePresence, motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import { popIn } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type DropdownItem =
  | {
      type?: "item";
      label: string;
      icon?: LucideIcon;
      onSelect: () => void;
      tone?: "default" | "destructive";
      disabled?: boolean;
    }
  | { type: "separator" };

const isSelectable = (item: DropdownItem) =>
  item.type !== "separator" && !item.disabled;

/**
 * Custom dropdown menu (WAI-ARIA menu-button pattern): full keyboard support
 * (Arrows, Home/End, Enter, Escape, type-ahead), roving focus, outside-click
 * dismissal. Material per spec section 5: `glass-regular`. Radius 20 (popover,
 * section 6) with 8px padding, so items are radius 12 (concentric rule).
 * Highlight is the Apple menu selection: blue fill, white label.
 */
export function Dropdown({
  trigger,
  items,
  align = "end",
  menuLabel,
  className,
}: {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: "start" | "end";
  menuLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const typeahead = useRef({ buffer: "", timer: null as ReturnType<typeof setTimeout> | null });

  const selectableIndexes = items
    .map((item, index) => (isSelectable(item) ? index : -1))
    .filter((index) => index >= 0);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    setActiveIndex(-1);
    if (returnFocus) {
      rootRef.current?.querySelector<HTMLElement>("[data-dropdown-trigger]")?.focus();
    }
  }, []);

  // Keep the active item element focused (roving focus within the menu).
  useEffect(() => {
    if (!open) return;
    itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  // Dismiss on outside pointer down.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  const moveActive = (direction: 1 | -1) => {
    if (selectableIndexes.length === 0) return;
    const pos = selectableIndexes.indexOf(activeIndex);
    const nextPos =
      pos < 0
        ? direction === 1
          ? 0
          : selectableIndexes.length - 1
        : (pos + direction + selectableIndexes.length) % selectableIndexes.length;
    setActiveIndex(selectableIndexes[nextPos]);
  };

  const runTypeahead = (char: string) => {
    const state = typeahead.current;
    if (state.timer) clearTimeout(state.timer);
    state.buffer += char.toLowerCase();
    state.timer = setTimeout(() => (state.buffer = ""), 500);
    const match = selectableIndexes.find((index) => {
      const item = items[index];
      return (
        item.type !== "separator" &&
        item.label.toLowerCase().startsWith(state.buffer)
      );
    });
    if (match != null) setActiveIndex(match);
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveActive(-1);
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(selectableIndexes[0]);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(selectableIndexes[selectableIndexes.length - 1]);
        break;
      case "Escape":
        event.preventDefault();
        close();
        break;
      case "Tab":
        close(false);
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        const item = items[activeIndex];
        if (item && item.type !== "separator" && !item.disabled) {
          item.onSelect();
          close();
        }
        break;
      }
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
          runTypeahead(event.key);
        }
    }
  };

  const clonedTrigger = isValidElement(trigger)
    ? cloneElement(trigger as ReactElement<Record<string, unknown>>, {
        onClick: (event: unknown) => {
          const handler = (trigger.props as { onClick?: (e: unknown) => void }).onClick;
          handler?.(event);
          const willOpen = !open;
          setOpen(willOpen);
          setActiveIndex(willOpen ? items.findIndex(isSelectable) : -1);
        },
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "data-dropdown-trigger": "",
      })
    : trigger;

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      {clonedTrigger}
      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            aria-label={menuLabel}
            aria-orientation="vertical"
            variants={popIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            onKeyDown={onMenuKeyDown}
            style={{ transformOrigin: align === "end" ? "top right" : "top left" }}
            className={cn(
              "glass-regular absolute top-full z-50 mt-2 min-w-52 overflow-hidden rounded-3xl p-2 shadow-e3",
              align === "end" ? "right-0" : "left-0",
            )}
          >
            {items.map((item, index) => {
              if (item.type === "separator") {
                return (
                  <div
                    key={`sep-${index}`}
                    role="separator"
                    className="mx-2 my-1 h-px bg-separator"
                  />
                );
              }
              const Icon = item.icon;
              const active = index === activeIndex;
              return (
                <button
                  key={item.label}
                  ref={(node) => {
                    itemRefs.current[index] = node;
                  }}
                  type="button"
                  role="menuitem"
                  tabIndex={active ? 0 : -1}
                  disabled={item.disabled}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    item.onSelect();
                    close();
                  }}
                  className={cn(
                    "flex h-8 w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 text-left text-callout outline-none transition-colors duration-100",
                    item.tone === "destructive" ? "text-red" : "text-label",
                    active &&
                      (item.tone === "destructive"
                        ? "bg-red text-white"
                        : "bg-blue-fill text-white"),
                    "disabled:pointer-events-none disabled:text-label-quaternary",
                  )}
                >
                  {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

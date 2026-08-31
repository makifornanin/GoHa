"use client";

import { AnimatePresence, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { LogoutButton } from "@/components/auth/logout-button";
import { Button } from "@/components/ui/button";
import { fade, spring } from "@/lib/motion";
import { useMounted } from "@/lib/use-mounted";
import { navGroups, type NavUser } from "@/lib/nav";
import { cn } from "@/lib/utils";

import { Brand } from "./brand";
import { NavLink } from "./nav-link";
import { ThemeToggle } from "./theme-toggle";
import { UserBadge } from "./user-badge";

/** Mobile top bar (`glass-thin`) with a slide-in glass sheet for navigation. */
export function MobileHeader({ className, user }: { className?: string; user: NavUser }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const mounted = useMounted();

  // The drawer closes on link navigation via each NavLink's onNavigate handler.
  // Lock body scroll, handle Escape, and move focus into the drawer while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const drawer = (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-overlay"
            onClick={() => setOpen(false)}
            aria-hidden
            variants={fade}
            initial="hidden"
            animate="visible"
            exit="exit"
          />
          <motion.div
            id="mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={spring.smooth}
            className={cn(
              "glass-thick absolute inset-y-0 left-0 flex w-[280px] max-w-[85%] flex-col gap-4",
              "border-0 border-r border-r-glass-border shadow-e3",
              // Respect the notch and the home indicator: the drawer is
              // full-height, so its own padding is the only thing keeping the
              // close button and the logout row out of the system UI.
              "px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]",
            )}
          >
            <div className="flex items-center justify-between">
              <Brand />
              <Button
                ref={closeRef}
                variant="ghost"
                size="icon"
                aria-label="Close navigation"
                onClick={() => setOpen(false)}
              >
                <X />
              </Button>
            </div>
            {/* The same groups the sidebar uses, from the same source, so the
                app does not describe itself one way on a laptop and another on
                a phone. */}
            <nav className="-mr-2 flex-1 overflow-y-auto pr-2" aria-label="Primary">
              <ul className="flex flex-col gap-4">
                {navGroups.map((group) => (
                  <li key={group.label}>
                    <h2 className="px-3 pb-1.5 text-footnote font-medium uppercase tracking-wide text-label-tertiary">
                      {group.label}
                    </h2>
                    <ul className="flex flex-col gap-0.5">
                      {group.items.map((item) => (
                        <li key={item.href}>
                          <NavLink
                            item={item}
                            indicatorId="drawer-active-indicator"
                            onNavigate={() => setOpen(false)}
                          />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="mt-auto flex flex-col gap-0.5 border-t border-separator pt-4">
              <UserBadge user={user} className="mb-2" />
              <LogoutButton />
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );

  return (
    <header
      className={cn(
        "glass-thin sticky top-0 z-30 flex h-14 items-center justify-between border-0 border-b border-b-glass-border px-4",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open navigation"
          aria-expanded={open}
          aria-controls="mobile-drawer"
          onClick={() => setOpen(true)}
        >
          <Menu />
        </Button>
        <Brand />
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle />
      </div>

      {/*
        The drawer is portaled to the body on purpose.

        This header carries `glass-thin`, and `backdrop-filter` makes an element
        a containing block for EVERY descendant, including `position: fixed`
        ones. Rendered in place, the drawer resolved `fixed inset-0` against the
        56px header rather than the viewport, so it opened as a small box clipped
        to the top bar with its contents spilling across the page. The portal is
        what puts it back on the viewport, so it must not be inlined again.
      */}
      {mounted ? createPortal(drawer, document.body) : null}
    </header>
  );
}

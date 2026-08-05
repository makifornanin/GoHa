"use client";

import { AnimatePresence, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { Button } from "@/components/ui/button";
import { fade, spring } from "@/lib/motion";
import { primaryNav, type NavUser } from "@/lib/nav";
import { cn } from "@/lib/utils";

import { Brand } from "./brand";
import { NavLink } from "./nav-link";
import { ThemeToggle } from "./theme-toggle";
import { UserBadge } from "./user-badge";

/** Mobile top bar (`glass-thin`) with a slide-in glass sheet for navigation. */
export function MobileHeader({ className, user }: { className?: string; user: NavUser }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

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

  return (
    <header
      className={cn(
        "glass-thin sticky top-0 z-30 flex h-14 items-center justify-between border-0 border-b border-b-glass-border px-4",
        className,
      )}
    >
      <div className="flex items-center gap-1">
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
              className="glass-thick absolute inset-y-0 left-0 flex w-[260px] max-w-[85%] flex-col gap-6 border-0 border-r border-r-glass-border px-4 py-6 shadow-e3"
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
              <nav className="-mr-2 flex-1 overflow-y-auto pr-2" aria-label="Primary">
                <ul className="flex flex-col gap-0.5">
                  {primaryNav.map((item) => (
                    <li key={item.href}>
                      <NavLink
                        item={item}
                        indicatorId="drawer-active-indicator"
                        onNavigate={() => setOpen(false)}
                      />
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
    </header>
  );
}

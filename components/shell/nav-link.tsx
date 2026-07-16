"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { spring } from "@/lib/motion";
import type { NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Sidebar item per spec section 8: height 32, padding-x 10, radius 8, gap 8.
 * Active: blue at 12% background with blue label and icon. The active
 * indicator is a `layoutId` element so it MORPHS between items on navigation
 * (spec section 9: morph, do not fade). Icons: 20px, stroke 1.5.
 *
 * `indicatorId` MUST be unique per nav container: the desktop sidebar stays
 * mounted (display: none) on mobile, so a shared layoutId would make the
 * drawer's pill morph from the hidden sidebar's zero-rect when it opens.
 */
export function NavLink({
  item,
  indicatorId,
  onNavigate,
}: {
  item: NavItem;
  indicatorId: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-8 items-center gap-2 rounded-md px-2.5 text-callout font-medium transition-colors duration-150",
        active
          ? "text-blue"
          : "text-label-secondary hover:bg-surface-hover hover:text-label",
      )}
    >
      {active ? (
        <motion.span
          layoutId={indicatorId}
          transition={spring.snappy}
          className="absolute inset-0 rounded-md bg-blue/12"
          aria-hidden
        />
      ) : null}
      <Icon className="relative size-5 shrink-0" aria-hidden />
      <span className="relative">{item.label}</span>
    </Link>
  );
}

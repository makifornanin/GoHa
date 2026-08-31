"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AddMenuFab } from "@/components/shell/add-menu";
import { mobileNav, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

function BottomItem({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-w-14 flex-col items-center gap-1 rounded-md px-2 py-1 transition-colors",
        active ? "text-blue" : "text-label-secondary hover:text-label",
      )}
    >
      <Icon className="size-5" aria-hidden />
      <span className="text-footnote">{item.label}</span>
    </Link>
  );
}

/** Mobile tab bar: `glass-thin` chrome with a blue primary center action. */
export function MobileBottomNav({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        "glass-thin fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-0 border-t border-t-glass-border px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      <BottomItem item={mobileNav[0]} />
      <BottomItem item={mobileNav[1]} />
      {/* Opens the same menu the sidebar does, upward so it clears the bar. */}
      <AddMenuFab />
      <BottomItem item={mobileNav[2]} />
      <BottomItem item={mobileNav[3]} />
    </nav>
  );
}

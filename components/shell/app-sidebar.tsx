"use client";

import { LogoutButton } from "@/components/auth/logout-button";
import { AddMenu } from "@/components/shell/add-menu";
import { navGroups, type NavUser } from "@/lib/nav";
import { cn } from "@/lib/utils";

import { Brand } from "./brand";
import { NavLink } from "./nav-link";
import { UserBadge } from "./user-badge";

/** Sidebar: 260px, `glass-thin` material (spec sections 5 and 7). */
export function AppSidebar({ className, user }: { className?: string; user: NavUser }) {
  return (
    <aside
      className={cn(
        "glass-thin fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col gap-6 border-0 border-r border-r-glass-border px-4 py-6",
        className,
      )}
    >
      <Brand className="px-2" />

      {/*
        One create affordance, and it is not task-shaped.

        "New Task" named the last rung of the chain as the only thing worth
        starting from the shell, which is exactly backwards for an app whose
        whole claim is that goals turn into days. This opens the full menu.
      */}
      <AddMenu context="root" variant="default" size="default" align="start" className="w-full [&>button]:w-full" />

      {/*
        Grouped by what you are DOING, not alphabetically or by build order.

        Twelve flat links gave a newcomer no way to tell that Focus supports
        To-dos or that Review reads what Today recorded. Four short groups make
        the workflow legible at a glance: plan it, do it, capture it, look back
        at it (docs/TERMINOLOGY.md).
      */}
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
                    <NavLink item={item} indicatorId="sidebar-active-indicator" />
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
    </aside>
  );
}

"use client";

import { CircleHelp, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { LogoutButton } from "@/components/auth/logout-button";
import { Button } from "@/components/ui/button";
import { primaryNav, type NavUser } from "@/lib/nav";
import { cn } from "@/lib/utils";

import { Brand } from "./brand";
import { NavLink } from "./nav-link";
import { UserBadge } from "./user-badge";

/** Sidebar: 260px, `glass-thin` material (spec sections 5 and 7). */
export function AppSidebar({ className, user }: { className?: string; user: NavUser }) {
  const router = useRouter();
  return (
    <aside
      className={cn(
        "glass-thin fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col gap-6 border-0 border-r border-r-glass-border px-4 py-6",
        className,
      )}
    >
      <Brand className="px-2" />

      <Button className="w-full" onClick={() => router.push("/tasks")}>
        <Plus />
        Quick Action
      </Button>

      <nav className="-mr-2 flex-1 overflow-y-auto pr-2" aria-label="Primary">
        <ul className="flex flex-col gap-0.5">
          {primaryNav.map((item) => (
            <li key={item.href}>
              <NavLink item={item} indicatorId="sidebar-active-indicator" />
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto flex flex-col gap-0.5 border-t border-separator pt-4">
        <UserBadge user={user} className="mb-2" />
        <button
          type="button"
          onClick={() => toast("The help center is coming soon.")}
          className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2.5 text-callout font-medium text-label-secondary transition-colors hover:bg-surface-hover hover:text-label"
        >
          <CircleHelp className="size-5 shrink-0" aria-hidden />
          Help
        </button>
        <LogoutButton />
      </div>
    </aside>
  );
}

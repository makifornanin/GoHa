import type { NavUser } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** Compact identity block for the shell: avatar initial, name, and email. */
export function UserBadge({ user, className }: { user: NavUser; className?: string }) {
  const initial = (user.name || user.email).trim().charAt(0).toUpperCase() || "?";

  return (
    <div className={cn("flex items-center gap-2 px-2 py-1", className)}>
      <div
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-5 text-subhead font-semibold text-label-secondary"
        aria-hidden
      >
        {initial}
      </div>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-callout font-medium text-label">{user.name || "Owner"}</p>
        <p className="truncate text-footnote text-label-secondary">{user.email}</p>
      </div>
    </div>
  );
}

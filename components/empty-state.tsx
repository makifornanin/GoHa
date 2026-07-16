import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Shared empty state: a SOLID card (never glass), a 28px icon at stroke 1.5
 * (spec section 8), one clear message, one next step.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-separator-opaque bg-surface px-6 py-12 text-center shadow-e1",
        className,
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-surface-secondary text-blue">
        <Icon className="size-7" aria-hidden />
      </div>
      <h2 className="mt-5 text-title-3 text-label">{title}</h2>
      <p className="mt-2 max-w-md text-body text-label-secondary">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

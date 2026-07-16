import type { LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

/**
 * Placeholder surface for this phase: the real shell plus a clearly labelled
 * empty state. No feature logic and no fake data. Each feature phase replaces
 * the corresponding page with real, database-backed content.
 */
export function ComingSoon({
  title,
  description,
  icon,
  empty,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  empty: { title: string; description: string };
}) {
  return (
    <div className="space-y-8">
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={icon}
        title={empty.title}
        description={empty.description}
      />
    </div>
  );
}

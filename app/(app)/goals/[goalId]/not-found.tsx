import { Target } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";

/**
 * A goal id that is not in this account's list.
 *
 * Deliberately does not distinguish "deleted" from "belongs to someone else":
 * confirming that an id exists on another account is a small leak, and to the
 * person reading it the two are the same problem anyway.
 */
export default function GoalNotFound() {
  return (
    <EmptyState
      icon={Target}
      title="That goal is not here"
      description="It may have been deleted, or the link may be wrong. Your other goals are all still on the board."
      action={
        <Link
          href="/goals"
          className="touch-target inline-flex items-center rounded-lg bg-blue-fill px-4 text-callout font-medium text-white transition-opacity hover:opacity-90"
        >
          Back to Goals
        </Link>
      }
    />
  );
}

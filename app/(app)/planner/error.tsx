"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/** Error boundary for the Day Planner. Never a blank panel: explain and retry. */
export default function PlannerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Day Planner route error", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-separator-opaque bg-surface px-6 py-16 text-center shadow-e1">
      <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-red/10 text-red">
        <TriangleAlert className="size-7" aria-hidden />
      </div>
      <h2 className="text-title-3 text-label">We couldn&apos;t load your plan</h2>
      <p className="mt-2 max-w-md text-body text-label-secondary">
        Something went wrong reaching the server. Nothing in your plan has changed. Please try
        again.
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
